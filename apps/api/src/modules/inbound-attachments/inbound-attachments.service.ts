import { EmailProvider, InboundAttachmentStatus } from '@/generated/prisma/enums';
import { formatAttachmentBlocks } from '@/lib/attachments/attachment-prompt-text';
import { AttachmentTextExtractor } from '@/lib/attachments/attachment-text-extractor';
import {
	INBOUND_ATTACHMENT_DOWNLOAD_TIMEOUT_MS,
	INBOUND_ATTACHMENT_MAX_BYTES,
	INBOUND_ATTACHMENT_MAX_FETCH_ATTEMPTS,
	INBOUND_ATTACHMENT_MAX_FILENAME_CHARS,
	INBOUND_ATTACHMENT_MAX_MIME_CHARS,
	INBOUND_ATTACHMENT_MAX_PER_MESSAGE,
	INBOUND_ATTACHMENT_MESSAGE_BUDGET_MS,
	resolveInboundAttachmentKind
} from '@/lib/attachments/inbound-attachment-constraints';
import {
	InboundAttachmentRetryableError,
	InboundAttachmentTooLargeError,
	hasMicrosoftAttachments,
	listGmailAttachmentsFromRaw,
	type InboundAttachmentMeta
} from '@/lib/email/raw-message-attachments';
import { EmailAccountsService, type MailboxScope } from '@/modules/email-accounts/email-accounts.service';
import { GmailApiService } from '@/modules/gmail/gmail-api.service';
import { LogService } from '@/modules/logger/log.service';
import { MicrosoftGraphApiService } from '@/modules/microsoft/microsoft-graph-api.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

const DOWNLOAD_LIMITS = { maxBytes: INBOUND_ATTACHMENT_MAX_BYTES, timeoutMs: INBOUND_ATTACHMENT_DOWNLOAD_TIMEOUT_MS };

// Extensions longer than this are not extensions; do not let one eat the filename budget.
const MAX_EXTENSION_CHARS = 10;

/** The slice of a RawMessage this service needs — a subset of what the pipeline already holds. */
export interface InboundAttachmentSource {
	id: string;
	organizationId: string;
	provider: EmailProvider;
	raw: unknown;
}

export interface InboundAttachmentSummary {
	filename: string;
	mimeType: string;
}

/** Internal: everything needed to call the mailbox API for one message. */
interface MailboxAccess {
	scope: MailboxScope;
	providerMessageId: string;
	isReadingEnabled: boolean;
}

interface PendingRow {
	id: string;
	providerAttachmentId: string;
	filename: string;
	mimeType: string;
	sizeBytes: number | null;
	fetchAttempts: number;
}

/**
 * Reads the attachments on an inbound message for the opportunity pipeline.
 *
 * Two deliberately separate steps, because they cost very different amounts:
 *
 *  - `listMetadata` — filenames + MIME types. Free on Gmail (already in the persisted payload);
 *    one cheap Graph call on Microsoft, and only when the message has attachments. Run for
 *    every message that survives the bulk-mail filter, because a filename alone is a useful
 *    classifier signal.
 *  - `readText` — downloads and parses. Run only for messages worth the provider calls: ones
 *    classified as a quote request, or thin-bodied "zie bijlage" mails being given a second look.
 *
 * FAILURE CONTRACT. An unreadable attachment must never cost the owner a lead, so everything
 * here catches, logs and degrades to "no attachment information" — with exactly ONE exception:
 * `InboundAttachmentRetryableError`. A transient provider failure is rethrown as that, on
 * purpose, so the pipeline leaves the message UNCLASSIFIED and the next run retries. Degrading
 * there would let the message be classified without its attachment, and classified messages are
 * never scanned again: for a "zie bijlage" mail, one network blip would lose the lead for good.
 * Retries are bounded by the write-ahead `fetchAttempts` counter on each row.
 */
@Injectable()
export class InboundAttachmentsService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly emailAccounts: EmailAccountsService,
		private readonly gmail: GmailApiService,
		private readonly microsoft: MicrosoftGraphApiService,
		private readonly extractor: AttachmentTextExtractor,
		private readonly logService: LogService
	) {}

	/**
	 * Attachments on the message, persisted as PENDING rows (idempotent). Signature logos and
	 * embedded images are dropped here and never recorded.
	 */
	async listMetadata(source: InboundAttachmentSource): Promise<InboundAttachmentSummary[]> {
		let found: InboundAttachmentMeta[];
		try {
			found = await this.discover(source);
		} catch (error) {
			// Only the Microsoft branch makes a provider call. Bounded upstream: the pipeline's catch
			// counts RawMessage.classifyAttempts and stops scanning the row at the cap.
			this.warn('inbound_attachment.metadata_failed', source, error);
			throw new InboundAttachmentRetryableError();
		}

		try {
			const attachments = found
				// "inline" alone is not enough to discard a part: Apple Mail sends ordinary PDF
				// attachments with `Content-Disposition: inline`. Only inline parts we could not
				// read anyway (logos, embedded images) are noise.
				.filter(a => !a.isInline || resolveInboundAttachmentKind(a.mimeType, a.filename) !== null)
				.slice(0, INBOUND_ATTACHMENT_MAX_PER_MESSAGE)
				.map(a => ({ ...a, filename: sanitizeFilename(a.filename), mimeType: sanitizeMimeType(a.mimeType) }));
			if (attachments.length === 0) {
				return [];
			}

			await this.prisma.rawMessageAttachment.createMany({
				data: attachments.map((a, position) => ({
					rawMessageId: source.id,
					organizationId: source.organizationId,
					providerAttachmentId: a.providerAttachmentId,
					filename: a.filename,
					mimeType: a.mimeType,
					sizeBytes: a.sizeBytes,
					position
				})),
				skipDuplicates: true
			});
			return attachments.map(a => ({ filename: a.filename, mimeType: a.mimeType }));
		} catch (error) {
			this.warn('inbound_attachment.metadata_failed', source, error);
			return [];
		}
	}

	/**
	 * Download + parse every still-PENDING attachment on the message, then return the combined
	 * text of all PARSED ones, budgeted for the prompt. Null when there is nothing readable or
	 * the org has switched AI attachment reading off.
	 *
	 * @throws InboundAttachmentRetryableError when a download failed transiently and the row
	 *         still has attempts left — see the failure contract on the class.
	 */
	async readText(source: InboundAttachmentSource): Promise<string | null> {
		let hasRetryableFailure = false;
		try {
			// Checked on EVERY call, before anything is returned — including text parsed on an
			// earlier attempt. If the owner switches reading off between a failed run and its retry,
			// the cached text must not reach the AI provider either: the switch is a promise about
			// what leaves the building, not about when we happened to parse.
			const access = await this.resolveAccess(source);
			if (!access || !access.isReadingEnabled) {
				return null;
			}

			const pending: PendingRow[] = await this.prisma.rawMessageAttachment.findMany({
				where: { rawMessageId: source.id, status: InboundAttachmentStatus.PENDING },
				orderBy: [{ position: 'asc' }, { id: 'asc' }]
			});

			const deadline = Date.now() + INBOUND_ATTACHMENT_MESSAGE_BUDGET_MS;
			for (const row of pending) {
				if (Date.now() > deadline) {
					// Out of time for this message: the rest are not going to be read.
					await this.settle(row.id, InboundAttachmentStatus.FAILED);
					continue;
				}
				if ((await this.readOne(source, access, row)) === 'retry') {
					hasRetryableFailure = true;
				}
			}

			if (!hasRetryableFailure) {
				return await this.combinedText(source.id);
			}
		} catch (error) {
			this.warn('inbound_attachment.read_failed', source, error);
			return null;
		}
		throw new InboundAttachmentRetryableError();
	}

	/**
	 * Drop the stored text for a message that turned out NOT to be a quote request. The
	 * thin-body rescue reads attachments of mails it is unsure about — invoices, contracts,
	 * whatever a stranger attached to a two-line mail. Once the verdict is negative there is no
	 * reason to keep a copy of that document's contents. Never throws.
	 */
	async discardText(rawMessageId: string): Promise<void> {
		try {
			await this.prisma.rawMessageAttachment.updateMany({
				where: { rawMessageId, extractedText: { not: null } },
				data: { extractedText: null }
			});
		} catch {
			// Best-effort hygiene; nothing depends on it.
		}
	}

	private async discover(source: InboundAttachmentSource): Promise<InboundAttachmentMeta[]> {
		if (source.provider === EmailProvider.GMAIL) {
			return listGmailAttachmentsFromRaw(source.raw);
		}

		// `false` is authoritative; `null` means the row predates `hasAttachments` being selected
		// (the delta $select is baked into stored deltaLinks), so go and check.
		if (hasMicrosoftAttachments(source.raw) === false) {
			return [];
		}
		const access = await this.resolveAccess(source);
		if (!access) {
			return [];
		}
		return this.emailAccounts.withFreshAccessToken(access.scope, token =>
			this.microsoft.listMessageAttachments(token, access.providerMessageId, DOWNLOAD_LIMITS.timeoutMs)
		);
	}

	private async readOne(
		source: InboundAttachmentSource,
		access: MailboxAccess,
		row: PendingRow
	): Promise<'done' | 'retry'> {
		// Decide from metadata first: never spend a provider call on a file we would refuse anyway.
		if (!resolveInboundAttachmentKind(row.mimeType, row.filename)) {
			await this.settle(row.id, InboundAttachmentStatus.UNSUPPORTED);
			return 'done';
		}
		if (row.sizeBytes !== null && row.sizeBytes > INBOUND_ATTACHMENT_MAX_BYTES) {
			await this.settle(row.id, InboundAttachmentStatus.TOO_LARGE);
			return 'done';
		}
		if (row.fetchAttempts >= INBOUND_ATTACHMENT_MAX_FETCH_ATTEMPTS) {
			// Either the provider kept failing, or parsing this file kept killing the process
			// (in which case no catch ever ran — only the write-ahead counter below survived).
			await this.settle(row.id, InboundAttachmentStatus.FAILED);
			return 'done';
		}

		// WRITE-AHEAD: committed before the download and the parse, so it counts attempts that
		// never got to report back.
		await this.prisma.rawMessageAttachment.update({
			where: { id: row.id },
			data: { fetchAttempts: { increment: 1 } }
		});

		let bytes: Buffer | null;
		try {
			bytes = await this.emailAccounts.withFreshAccessToken(access.scope, token =>
				source.provider === EmailProvider.GMAIL
					? this.gmail.getAttachment(
							token,
							access.providerMessageId,
							row.providerAttachmentId,
							DOWNLOAD_LIMITS
						)
					: this.microsoft.getAttachmentContent(
							token,
							access.providerMessageId,
							row.providerAttachmentId,
							DOWNLOAD_LIMITS
						)
			);
		} catch (error) {
			if (error instanceof InboundAttachmentTooLargeError) {
				await this.settle(row.id, InboundAttachmentStatus.TOO_LARGE);
				return 'done';
			}
			this.warn('inbound_attachment.fetch_failed', source, error, {
				filename: row.filename,
				attempt: row.fetchAttempts + 1
			});
			if (row.fetchAttempts + 1 >= INBOUND_ATTACHMENT_MAX_FETCH_ATTEMPTS) {
				await this.settle(row.id, InboundAttachmentStatus.FAILED);
				return 'done';
			}
			return 'retry';
		}

		if (!bytes) {
			// Deleted at the provider between sync and now — trying again cannot help.
			await this.settle(row.id, InboundAttachmentStatus.FAILED);
			return 'done';
		}

		const result = await this.extractor.extract({ filename: row.filename, mimeType: row.mimeType, bytes });
		await this.settle(row.id, InboundAttachmentStatus[result.status], result.text, result.isTruncated);
		return 'done';
	}

	private async settle(
		id: string,
		status: InboundAttachmentStatus,
		extractedText: string | null = null,
		isTruncated = false
	): Promise<void> {
		await this.prisma.rawMessageAttachment.update({ where: { id }, data: { status, extractedText, isTruncated } });
	}

	private async combinedText(rawMessageId: string): Promise<string | null> {
		const parsed = await this.prisma.rawMessageAttachment.findMany({
			where: { rawMessageId, status: InboundAttachmentStatus.PARSED },
			orderBy: [{ position: 'asc' }, { id: 'asc' }],
			select: { filename: true, extractedText: true }
		});
		return formatAttachmentBlocks(parsed.map(row => ({ filename: row.filename, text: row.extractedText })));
	}

	private async resolveAccess(source: InboundAttachmentSource): Promise<MailboxAccess | null> {
		const row = await this.prisma.rawMessage.findUnique({
			where: { id: source.id },
			select: {
				providerMessageId: true,
				emailAccount: {
					select: {
						userId: true,
						disconnectedAt: true,
						organization: { select: { aiAttachmentReadingEnabled: true } }
					}
				}
			}
		});
		const account = row?.emailAccount;
		// Orphaned (connecting user deleted) or disconnected mailboxes cannot be called.
		if (!row || !account?.userId || account.disconnectedAt) {
			return null;
		}
		return {
			scope: { provider: source.provider, organizationId: source.organizationId, userId: account.userId },
			providerMessageId: row.providerMessageId,
			isReadingEnabled: account.organization.aiAttachmentReadingEnabled
		};
	}

	// The catch blocks above are part of the failure contract; a logger that throws from inside
	// one would break it, so this swallows its own failure.
	private warn(
		action: string,
		source: InboundAttachmentSource,
		error: unknown,
		extra: Record<string, unknown> = {}
	): void {
		try {
			this.logService.logAction({
				action,
				message: `Attachment handling degraded for raw message ${source.id}`,
				metadata: {
					rawMessageId: source.id,
					organizationId: source.organizationId,
					provider: source.provider,
					error: error instanceof Error ? error.message : String(error),
					...extra
				},
				level: 'warn',
				context: 'InboundAttachmentsService'
			});
		} catch {
			// Nothing sensible left to do.
		}
	}
}

// Filenames come from whoever sent the email and end up in prompts, the database and the UI.
// NUL makes Postgres reject the whole insert; the other C0 controls are noise; bidi overrides
// (U+202A-202E, U+2066-2069) and direction marks can make a name that really ends in ".exe"
// DISPLAY as if it ended in ".pdf". Matched by char code rather than a regex so this source
// file carries no invisible characters of its own.
function isUnsafeFilenameCharacter(character: string): boolean {
	const code = character.charCodeAt(0);
	return (
		code < 0x20 ||
		code === 0x7f ||
		(code >= 0x202a && code <= 0x202e) ||
		(code >= 0x2066 && code <= 0x2069) ||
		code === 0x200e ||
		code === 0x200f
	);
}

function stripUnsafe(value: string): string {
	return Array.from(value)
		.filter(character => !isUnsafeFilenameCharacter(character))
		.join('')
		.trim();
}

// Truncate the STEM, never the extension: mail clients send real documents as
// application/octet-stream all the time, and then the extension is the only thing that says
// "this is a PDF". Chopping it would turn a supported document into UNSUPPORTED.
function sanitizeFilename(raw: string): string {
	const cleaned = stripUnsafe(raw) || 'bijlage';
	if (cleaned.length <= INBOUND_ATTACHMENT_MAX_FILENAME_CHARS) {
		return cleaned;
	}
	const dot = cleaned.lastIndexOf('.');
	const extension = dot > 0 && cleaned.length - dot <= MAX_EXTENSION_CHARS ? cleaned.slice(dot) : '';
	return cleaned.slice(0, INBOUND_ATTACHMENT_MAX_FILENAME_CHARS - extension.length) + extension;
}

function sanitizeMimeType(raw: string): string {
	return stripUnsafe(raw).slice(0, INBOUND_ATTACHMENT_MAX_MIME_CHARS);
}

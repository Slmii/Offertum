import { EmailProvider } from '@/generated/prisma/enums';
import { EMAIL_ACCOUNT_NOT_FOUND } from '@/lib/errors';
import { EmailAccountsService } from '@/modules/email-accounts/email-accounts.service';
import {
	GmailApiService,
	GmailHistoryExpiredException,
	type GmailFullMessage,
	type GmailMessageStub
} from '@/modules/gmail/gmail-api.service';
import { LogService } from '@/modules/logger/log.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { Injectable, NotFoundException } from '@nestjs/common';

/** Safety cap — bounds runtime if a watch was unattended for too long. */
const MAX_PAGES = 50;

export interface DeltaSyncResult {
	emailAccountId: string;
	pagesFetched: number;
	messagesInserted: number;
	messagesSkipped: number;
	/** New historyId stored on the EmailAccount row. */
	historyId: string | null;
	/** True if the input cursor was rejected by Gmail (>7 days old) and we recovered. */
	historyExpired: boolean;
}

interface ParsedFrom {
	email: string | null;
	name: string | null;
}

/**
 * W3.5 — incremental sync triggered by a Gmail push notification.
 *
 * Walks `users.history.list` from `EmailAccount.historyId`, fetches every `messageAdded`
 * payload via `messages.get?format=full`, and persists each as a `RawMessage` row. Idempotent
 * via the same `(emailAccountId, providerMessageId)` unique index the backfill uses — if a
 * push duplicates a message we already have we silently skip.
 *
 * **History-expired recovery:** Gmail retains history for ~7 days. If our stored cursor is
 * older we'd see a 404 from `history.list`. We don't try to be clever — we recover by
 * re-acquiring a fresh cursor via `getProfile`, which means we'll MISS any messages that
 * accumulated during the gap. The user-visible symptom would be a brief inbox lag; the
 * alternative (replaying via a date-range search) is much more complex and rarely needed
 * in practice (only fires if our app was offline >7 days).
 *
 * Kept framework-agnostic (no Inngest types here) so the unit tests don't need to spin up
 * an Inngest dev server. The Inngest function wrapper lives in `modules/inngest/functions/`.
 */
@Injectable()
export class GmailDeltaSyncService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly accounts: EmailAccountsService,
		private readonly api: GmailApiService,
		private readonly logService: LogService
	) {}

	async run(emailAccountId: string): Promise<DeltaSyncResult> {
		const account = await this.prisma.emailAccount.findUnique({
			where: { id: emailAccountId },
			select: {
				id: true,
				organizationId: true,
				userId: true,
				email: true,
				provider: true,
				historyId: true
			}
		});
		if (!account || account.provider !== EmailProvider.GMAIL) {
			throw new NotFoundException(EMAIL_ACCOUNT_NOT_FOUND);
		}
		if (!account.userId) {
			// Orphan row — userId set null on user delete. Skip cleanly; not an error.
			this.logService.logAction({
				action: 'email.delta_sync.orphaned',
				message: `EmailAccount ${emailAccountId} has no userId — skipping delta sync`,
				metadata: { provider: account.provider, emailAccountId },
				level: 'warn',
				context: 'GmailDeltaSyncService'
			});
			return { emailAccountId, pagesFetched: 0, messagesInserted: 0, messagesSkipped: 0, historyId: null, historyExpired: false };
		}
		if (!account.historyId) {
			// No starting cursor — backfill never completed (or never ran). Skip; on the
			// next backfill completion a watch will be re-established with a cursor.
			this.logService.logAction({
				action: 'email.delta_sync.no_cursor',
				message: `EmailAccount ${emailAccountId} has no historyId yet — backfill must complete first`,
				metadata: { provider: account.provider, emailAccountId },
				level: 'warn',
				context: 'GmailDeltaSyncService'
			});
			return { emailAccountId, pagesFetched: 0, messagesInserted: 0, messagesSkipped: 0, historyId: null, historyExpired: false };
		}

		const scope = {
			provider: EmailProvider.GMAIL,
			organizationId: account.organizationId,
			userId: account.userId
		};

		let pageToken: string | undefined;
		let pagesFetched = 0;
		let messagesInserted = 0;
		let messagesSkipped = 0;
		let newHistoryId: string | null = null;
		let historyExpired = false;

		const collectedStubs: GmailMessageStub[] = [];

		const work = async (accessToken: string): Promise<void> => {
			while (pagesFetched < MAX_PAGES) {
				const page = await this.api.listHistoryPage(accessToken, {
					startHistoryId: account.historyId!,
					pageToken
				});
				pagesFetched += 1;
				newHistoryId = page.historyId;

				// Flatten `messagesAdded` across all records on this page. A single history
				// entry can contain multiple added messages (e.g. batch arrival), and
				// the same message id can appear in multiple records if it had multiple
				// `messagesAdded` events — `Set` below dedupes.
				for (const record of page.history) {
					for (const added of record.messagesAdded ?? []) {
						collectedStubs.push(added.message);
					}
				}

				if (!page.nextPageToken) {
					break;
				}
				pageToken = page.nextPageToken;
			}

			// Dedup before fetching — saves quota when the same id appeared in multiple
			// history records on different pages.
			const uniqueIds = Array.from(new Set(collectedStubs.map(s => s.id)));
			if (uniqueIds.length === 0) {
				return;
			}

			// Fetch full payloads in parallel. Same QPS rationale as backfill — 100 in
			// parallel is well under Gmail's per-user quota ceiling.
			const messages = await Promise.all(uniqueIds.map(id => this.api.getMessageFull(accessToken, id)));
			const inserted = await this.persistBatch(emailAccountId, account.organizationId, messages);
			messagesInserted += inserted;
			messagesSkipped += messages.length - inserted;
		};

		try {
			await this.accounts.withFreshAccessToken(scope, work);
		} catch (error) {
			if (!(error instanceof GmailHistoryExpiredException)) {
				throw error;
			}

			// Stored cursor is stale. Re-acquire a fresh one via getProfile so the NEXT
			// push has a valid starting point. We don't replay the gap — see service docstring.
			historyExpired = true;
			this.logService.logAction({
				action: 'email.delta_sync.history_expired',
				message: `Gmail history cursor expired for ${account.email} — re-acquiring`,
				metadata: { provider: account.provider, emailAccountId, previousHistoryId: account.historyId },
				level: 'warn',
				context: 'GmailDeltaSyncService'
			});
			const recoveredHistoryId = await this.accounts.withFreshAccessToken(scope, async accessToken => {
				const profile = await this.api.getProfile(accessToken);
				return profile.historyId;
			});
			newHistoryId = recoveredHistoryId;
		}

		// Advance the cursor — even on history-expired we move forward so the next push
		// doesn't re-trip the same 404. Never write null over an existing cursor.
		if (newHistoryId) {
			await this.prisma.emailAccount.update({
				where: { id: emailAccountId },
				data: { historyId: newHistoryId }
			});
		}

		this.logService.logAction({
			action: 'email.delta_sync.completed',
			message: `Delta sync complete for ${account.email}: ${pagesFetched} pages, ${messagesInserted} new, ${messagesSkipped} already present`,
			metadata: {
				provider: account.provider,
				emailAccountId,
				pagesFetched,
				messagesInserted,
				messagesSkipped,
				historyId: newHistoryId,
				historyExpired
			},
			context: 'GmailDeltaSyncService'
		});

		return {
			emailAccountId,
			pagesFetched,
			messagesInserted,
			messagesSkipped,
			historyId: newHistoryId,
			historyExpired
		};
	}

	/**
	 * Mirrors `GmailBackfillService.persistBatch`. Kept private + duplicated rather than
	 * shared to keep the two services independently testable — the persistence shape is
	 * incidentally identical today but might diverge (e.g. delta-sync might want to fire
	 * a `RawMessage.created` event downstream while backfill batches don't).
	 */
	private async persistBatch(
		emailAccountId: string,
		organizationId: string,
		messages: readonly GmailFullMessage[]
	): Promise<number> {
		if (messages.length === 0) {
			return 0;
		}

		const incomingIds = messages.map(m => m.id);
		const existing = await this.prisma.rawMessage.findMany({
			where: { emailAccountId, providerMessageId: { in: incomingIds } },
			select: { providerMessageId: true }
		});
		const existingSet = new Set(existing.map(r => r.providerMessageId));
		const toInsert = messages.filter(m => !existingSet.has(m.id));

		if (toInsert.length === 0) {
			return 0;
		}

		const result = await this.prisma.rawMessage.createMany({
			data: toInsert.map(m => {
				const headers = m.payload?.headers ?? [];
				const fromHeader = findHeader(headers, 'from');
				const from = parseFrom(fromHeader);
				return {
					emailAccountId,
					organizationId,
					providerMessageId: m.id,
					threadId: m.threadId ?? null,
					internalDate: new Date(Number(m.internalDate)),
					subject: findHeader(headers, 'subject'),
					fromEmail: from.email,
					fromName: from.name,
					raw: m as unknown as object
				};
			}),
			skipDuplicates: true
		});

		return result.count;
	}
}

function findHeader(headers: ReadonlyArray<{ name: string; value: string }>, name: string): string | null {
	return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;
}

function parseFrom(raw: string | null): ParsedFrom {
	if (!raw) {
		return { email: null, name: null };
	}

	const angle = raw.match(/^(.*?)<([^>]+)>\s*$/);
	if (angle) {
		const name = angle[1]!.trim().replace(/^"|"$/g, '').trim();
		return { email: angle[2]!.trim().toLowerCase(), name: name || null };
	}

	const trimmed = raw.trim();
	if (trimmed.includes('@')) {
		return { email: trimmed.toLowerCase(), name: null };
	}
	return { email: null, name: null };
}

import { EmailProvider } from '@/generated/prisma/enums';
import { EMAIL_ACCOUNT_NOT_FOUND } from '@/lib/errors';
import { EmailAccountsService } from '@/modules/email-accounts/email-accounts.service';
import type { GmailFullMessage } from '@/modules/gmail/gmail-api.service';
import { GmailApiService } from '@/modules/gmail/gmail-api.service';
import { LogService } from '@/modules/logger/log.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { Injectable, NotFoundException } from '@nestjs/common';

/**
 * How far back we fetch on initial connect.
 *
 * 90 days is a sweet spot for SMB inboxes: typical Quoteom users see ~150–600 messages
 * in their last quarter, which is enough corpus to make the post-connect dashboard feel
 * "full" and gives the classifier real material to work against. Fits comfortably
 * within Inngest's 4-hour step timeout even on busy inboxes.
 *
 * Bumping past ~180 days is the point at which we'd want to split the single Inngest
 * step into per-page steps for finer-grained retry — defer until real users hit it.
 */
const BACKFILL_DAYS = 90;

/** Pagination: 100 per page is Gmail's sensible default; quota cost is per-call. */
const PAGE_SIZE = 100;

/** Safety: stop after this many pages to bound runtime on huge inboxes. ~10k messages. */
const MAX_PAGES = 100;

export interface BackfillResult {
	emailAccountId: string;
	pagesFetched: number;
	messagesInserted: number;
	messagesSkipped: number;
	historyId: string | null;
}

interface ParsedFrom {
	email: string | null;
	name: string | null;
}

/**
 * Backfills a freshly-connected mailbox: walks Gmail's last `BACKFILL_DAYS` of messages,
 * persisting each one as a `RawMessage` row. Idempotent — re-runs upsert against the
 * `(emailAccountId, providerMessageId)` unique index, so a cancelled-mid-run backfill
 * resumes cleanly the next time the event fires (whether via reconnect or manual retry).
 *
 * Kept deliberately framework-agnostic — no Inngest types here. The Inngest function
 * wrapper (`GmailBackfillFunction`) is what turns this into a worker. Lets us unit-test
 * the actual backfill logic without spinning up an Inngest dev server.
 */
@Injectable()
export class GmailBackfillService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly accounts: EmailAccountsService,
		private readonly api: GmailApiService,
		private readonly logService: LogService
	) {}

	async run(emailAccountId: string): Promise<BackfillResult> {
		// `findFirst` with `disconnectedAt: null` (not `findUnique` on id alone) so a
		// stale Inngest event for an account that's been soft-disconnected since it was
		// enqueued is treated the same as a missing row — no work, no crash.
		const account = await this.prisma.emailAccount.findFirst({
			where: { id: emailAccountId, disconnectedAt: null },
			select: { id: true, organizationId: true, userId: true, email: true, provider: true }
		});
		if (!account || account.provider !== EmailProvider.GMAIL) {
			throw new NotFoundException(EMAIL_ACCOUNT_NOT_FOUND);
		}
		if (!account.userId) {
			// userId is nullable on the schema only because of `onDelete: SetNull`. Without it,
			// `withFreshAccessToken` has no scope. Treat as a no-op (the row got orphaned).
			this.logService.logAction({
				action: 'email.backfill.orphaned',
				message: `EmailAccount ${emailAccountId} has no userId — skipping backfill`,
				metadata: { provider: account.provider, emailAccountId },
				level: 'warn',
				context: 'GmailBackfillService'
			});
			return { emailAccountId, pagesFetched: 0, messagesInserted: 0, messagesSkipped: 0, historyId: null };
		}

		const scope = {
			provider: EmailProvider.GMAIL,
			organizationId: account.organizationId,
			userId: account.userId
		};
		const cutoff = formatGmailDateQuery(new Date(Date.now() - BACKFILL_DAYS * 24 * 60 * 60 * 1000));
		// `in:inbox` scopes to RECEIVED mail only — what the classifier cares about.
		// Without it, Gmail's `messages.list` defaults to all labels (Inbox, Sent, Drafts,
		// archived…) which inflates the corpus with outbound + unrelated content and
		// makes both the backfill slower and the classifier noisier.
		const q = `after:${cutoff} in:inbox`;

		let pageToken: string | undefined;
		let pagesFetched = 0;
		let messagesInserted = 0;
		let messagesSkipped = 0;

		// `withFreshAccessToken` retries the whole inner callback once if Gmail 401s mid-call
		// (e.g. user revoked while we were running). For backfill we accept that retry cost —
		// the alternative is a half-completed backfill on revoke.
		const result = await this.accounts.withFreshAccessToken(scope, async accessToken => {
			while (pagesFetched < MAX_PAGES) {
				const page = await this.api.listMessagesPage(accessToken, { q, pageToken, maxResults: PAGE_SIZE });
				pagesFetched += 1;

				if (page.messages.length === 0) {
					break;
				}

				// Fetch all messages on this page in parallel. Gmail's per-user QPS limit is
				// generous (~250 quota units/sec, get costs 5). 100 parallel calls is well
				// within bounds; bigger would risk rate-limit slowdowns from Google.
				const fetched = await Promise.all(
					page.messages.map(stub => this.api.getMessageFull(accessToken, stub.id))
				);
				// Drop nulls — `getMessageFull` returns null on 404 (message deleted between
				// list + get). Without this filter persistBatch would NPE on `.payload?.headers`.
				const full = fetched.filter((m): m is NonNullable<typeof m> => m !== null);

				const inserted = await this.persistBatch(emailAccountId, account.organizationId, full);
				messagesInserted += inserted;
				messagesSkipped += full.length - inserted;

				if (!page.nextPageToken) {
					break;
				}
				pageToken = page.nextPageToken;
			}

			// Capture the mailbox's current historyId AFTER backfill completes — that's the
			// starting cursor push delta sync will use. Done last so any subsequent
			// pushes don't include events we already covered in the backfill.
			const profile = await this.api.getProfile(accessToken);
			return profile.historyId;
		});

		await this.prisma.emailAccount.update({
			where: { id: emailAccountId },
			data: { historyId: result }
		});

		this.logService.logAction({
			action: 'email.backfill.completed',
			message: `Backfill complete for ${account.email}: ${pagesFetched} pages, ${messagesInserted} new, ${messagesSkipped} already present`,
			metadata: {
				provider: account.provider,
				emailAccountId,
				pagesFetched,
				messagesInserted,
				messagesSkipped,
				historyId: result
			},
			context: 'GmailBackfillService'
		});

		return {
			emailAccountId,
			pagesFetched,
			messagesInserted,
			messagesSkipped,
			historyId: result
		};
	}

	/**
	 * Persist a page's worth of messages. Returns the count of NEWLY inserted rows
	 * (already-present messages are silently skipped — they're immutable upstream).
	 *
	 * Strategy: one query to find which providerMessageIds already exist for this
	 * account, then `createMany` for the rest with `skipDuplicates: true` as a belt-
	 * and-suspenders against concurrent backfills racing on the same account. Beats
	 * N individual upserts on round-trip count for typical pages (~100 messages).
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
			// Belt-and-suspenders: even if a concurrent backfill races us and inserts the
			// same id between our SELECT and our INSERT, the unique-index conflict is
			// silently filtered instead of throwing.
			skipDuplicates: true
		});

		return result.count;
	}
}

/** Gmail's `q=after:YYYY/MM/DD` expects slash-separated date — UTC. */
function formatGmailDateQuery(d: Date): string {
	const y = d.getUTCFullYear();
	const m = String(d.getUTCMonth() + 1).padStart(2, '0');
	const day = String(d.getUTCDate()).padStart(2, '0');
	return `${y}/${m}/${day}`;
}

function findHeader(headers: ReadonlyArray<{ name: string; value: string }>, name: string): string | null {
	return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;
}

/**
 * Parse a Gmail `From` header value: `Name <email@domain>` OR bare `email@domain`.
 *
 * Doesn't try to handle RFC 2047 encoded-words ("=?UTF-8?B?...?=") — those are <1% of
 * real-world senders and the AI extractor will see the raw payload anyway. If display
 * matters later we can plug in a full address parser.
 */
function parseFrom(raw: string | null): ParsedFrom {
	if (!raw) {
		return { email: null, name: null };
	}

	const angle = raw.match(/^(.*?)<([^>]+)>\s*$/);
	if (angle) {
		const name = angle[1]!.trim().replace(/^"|"$/g, '').trim();
		return { email: angle[2]!.trim().toLowerCase(), name: name || null };
	}

	// Bare email — no display name.
	const trimmed = raw.trim();
	if (trimmed.includes('@')) {
		return { email: trimmed.toLowerCase(), name: null };
	}
	return { email: null, name: null };
}

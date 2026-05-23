import { daysToMs } from '@/lib/time/duration';
import { EmailProvider } from '@/generated/prisma/enums';
import { EMAIL_ACCOUNT_NOT_FOUND } from '@/lib/errors';
import { EmailAccountsService } from '@/modules/email-accounts/email-accounts.service';
import { LogService } from '@/modules/logger/log.service';
import type { MicrosoftFullMessage } from '@/modules/microsoft/microsoft-graph-api.service';
import { MicrosoftGraphApiService } from '@/modules/microsoft/microsoft-graph-api.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { Injectable, NotFoundException } from '@nestjs/common';

/**
 * same backfill window as Gmail. See `gmail-backfill.service.ts` for rationale.
 */
const BACKFILL_DAYS = 90;

/** Graph's per-page max is 1000; we keep parity with Gmail's chosen page size. */
const PAGE_SIZE = 100;

/** Safety cap — same as Gmail. ~10k messages worst case. */
const MAX_PAGES = 100;

export interface MicrosoftBackfillResult {
	emailAccountId: string;
	pagesFetched: number;
	messagesInserted: number;
	messagesSkipped: number;
	/** True when we successfully captured a `deltaLink` cursor at end-of-backfill, so the
	 * next push-triggered delta-sync only fetches new mail instead of the whole inbox. */
	deltaLinkAcquired: boolean;
}

/**
 * Backfills a freshly-connected Microsoft mailbox: walks Graph's `/me/mailFolders/Inbox/
 * messages` for the last `BACKFILL_DAYS`, persisting each one as a `RawMessage` row.
 * Same idempotency contract as `GmailBackfillService` — re-runs hit the same unique
 * index on `(emailAccountId, providerMessageId)` and skip duplicates.
 * Key differences from Gmail's backfill (encapsulated in `MicrosoftGraphApiService`):
 *  - Graph returns the full message body in `messages.list` (no per-message GET call needed)
 *  - Pagination via `@odata.nextLink` (full URL), not a token
 *  - `$filter=receivedDateTime ge ISO` instead of Gmail's `q=after:YYYY/MM/DD` syntax
 *  - No equivalent of Gmail's `historyId` — Graph push subscriptions use a
 *    different cursor model. We leave `EmailAccount.historyId` null for Microsoft.
 */
@Injectable()
export class MicrosoftBackfillService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly accounts: EmailAccountsService,
		private readonly api: MicrosoftGraphApiService,
		private readonly logService: LogService
	) {}

	async run(emailAccountId: string): Promise<MicrosoftBackfillResult> {
		// `findFirst` with `disconnectedAt: null` (not `findUnique` on id alone) so a
		// stale Inngest event for an account that's been soft-disconnected since it was
		// enqueued is treated the same as a missing row — no work, no crash.
		const account = await this.prisma.emailAccount.findFirst({
			where: { id: emailAccountId, disconnectedAt: null },
			select: { id: true, organizationId: true, userId: true, email: true, provider: true }
		});
		if (!account || account.provider !== EmailProvider.MICROSOFT) {
			throw new NotFoundException(EMAIL_ACCOUNT_NOT_FOUND);
		}
		if (!account.userId) {
			this.logService.logAction({
				action: 'email.backfill.orphaned',
				message: `EmailAccount ${emailAccountId} has no userId — skipping backfill`,
				metadata: { provider: account.provider, emailAccountId },
				level: 'warn',
				context: 'MicrosoftBackfillService'
			});
			return {
				emailAccountId,
				pagesFetched: 0,
				messagesInserted: 0,
				messagesSkipped: 0,
				deltaLinkAcquired: false
			};
		}

		const scope = {
			provider: EmailProvider.MICROSOFT,
			organizationId: account.organizationId,
			userId: account.userId
		};
		const cutoff = new Date(Date.now() - daysToMs(BACKFILL_DAYS)).toISOString();
		// Graph's $filter expects ISO 8601 with single-quoted strings, no spaces in the
		// comparison — `receivedDateTime ge 2026-02-12T00:00:00Z`. Already-Z-suffixed.
		const filter = `receivedDateTime ge ${cutoff}`;

		let nextLink: string | undefined;
		let pagesFetched = 0;
		let messagesInserted = 0;
		let messagesSkipped = 0;

		await this.accounts.withFreshAccessToken(scope, async accessToken => {
			while (pagesFetched < MAX_PAGES) {
				const page = await this.api.listInboxMessagesPage(accessToken, {
					filter: nextLink ? undefined : filter,
					top: PAGE_SIZE,
					nextLink
				});
				pagesFetched += 1;

				if (page.messages.length === 0) {
					break;
				}

				const inserted = await this.persistBatch(emailAccountId, account.organizationId, page.messages);
				messagesInserted += inserted;
				messagesSkipped += page.messages.length - inserted;

				if (!page.nextLink) {
					break;
				}
				nextLink = page.nextLink;
			}
		});

		// Capture a `deltaLink` cursor now that backfill has the 90-day window in. Without
		// this, the first push-triggered delta-sync calls `/me/messages/delta` with no
		// cursor — Graph then returns a snapshot of the ENTIRE inbox (not just changes),
		// causing every older-than-90-days message to be processed by the AI on first
		// push. We walk the delta endpoint to completion here purely to capture the
		// cursor and discard the messages (they're either already persisted via the
		// date-filtered backfill, or intentionally outside the 90-day window).
		const deltaLink = await this.captureFreshDeltaLink(scope);
		if (deltaLink) {
			await this.prisma.emailAccount.update({
				where: { id: emailAccountId },
				data: { deltaLink }
			});
		} else {
			this.logService.logAction({
				action: 'email.backfill.delta_link_capture_failed',
				message: `Backfill completed but failed to capture a deltaLink for ${account.email} — first push will over-fetch`,
				metadata: { provider: account.provider, emailAccountId },
				level: 'warn',
				context: 'MicrosoftBackfillService'
			});
		}

		this.logService.logAction({
			action: 'email.backfill.completed',
			message: `Backfill complete for ${account.email}: ${pagesFetched} pages, ${messagesInserted} new, ${messagesSkipped} already present (deltaLink: ${deltaLink ? 'captured' : 'missed'})`,
			metadata: {
				provider: account.provider,
				emailAccountId,
				pagesFetched,
				messagesInserted,
				messagesSkipped,
				deltaLinkAcquired: deltaLink !== null
			},
			context: 'MicrosoftBackfillService'
		});

		return {
			emailAccountId,
			pagesFetched,
			messagesInserted,
			messagesSkipped,
			deltaLinkAcquired: deltaLink !== null
		};
	}

	/**
	 * Walk `/me/messages/delta` from a fresh start to its end purely to capture the
	 * `@odata.deltaLink` cursor. Messages returned along the way are intentionally
	 * discarded — they're either already in `RawMessage` from the date-filtered backfill
	 * (and would be deduped on insert anyway) OR they're older than the 90-day window
	 * and we don't want them processed.
	 * Capped at `MAX_PAGES` so a malformed Graph response (deltaLink never returned,
	 * nextLink looping) can't hang forever.
	 */
	private async captureFreshDeltaLink(scope: {
		provider: EmailProvider;
		organizationId: string;
		userId: string;
	}): Promise<string | null> {
		return this.accounts.withFreshAccessToken(scope, async accessToken => {
			let cursor: string | null = null;
			for (let i = 0; i < MAX_PAGES; i += 1) {
				const page = await this.api.getDelta(accessToken, cursor);
				if (page.deltaLink) {
					return page.deltaLink;
				}
				if (page.nextLink) {
					cursor = page.nextLink;
					continue;
				}
				return null;
			}
			return null;
		});
	}

	/**
	 * Persist a page's worth of messages. Same find-existing-then-createMany pattern as
	 * Gmail's backfill — avoids N upserts when most messages are new.
	 */
	private async persistBatch(
		emailAccountId: string,
		organizationId: string,
		messages: readonly MicrosoftFullMessage[]
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
				const fromAddr = m.from?.emailAddress;
				return {
					emailAccountId,
					organizationId,
					providerMessageId: m.id,
					threadId: m.conversationId ?? null,
					internalDate: new Date(m.receivedDateTime),
					subject: m.subject ?? null,
					fromEmail: fromAddr?.address?.toLowerCase() ?? null,
					fromName: fromAddr?.name ?? null,
					raw: m as unknown as object
				};
			}),
			skipDuplicates: true
		});

		return result.count;
	}
}

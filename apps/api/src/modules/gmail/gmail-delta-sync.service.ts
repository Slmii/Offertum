import { EmailProvider } from '@/generated/prisma/enums';
import { EMAIL_ACCOUNT_NOT_FOUND } from '@/lib/errors';
import { EmailAccountsService } from '@/modules/email-accounts/email-accounts.service';
import {
	GmailApiService,
	GmailHistoryExpiredException,
	type GmailFullMessage,
	type GmailHistoryPage
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
 * incremental sync triggered by a Gmail push notification.
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
		// `findFirst` + `disconnectedAt: null`: a Pub/Sub push that arrives mid-disconnect
		// (the watch hasn't been stopped at Google yet) shouldn't drive work on a row
		// the user just severed.
		const account = await this.prisma.emailAccount.findFirst({
			where: { id: emailAccountId, disconnectedAt: null },
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
			return {
				emailAccountId,
				pagesFetched: 0,
				messagesInserted: 0,
				messagesSkipped: 0,
				historyId: null,
				historyExpired: false
			};
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
			return {
				emailAccountId,
				pagesFetched: 0,
				messagesInserted: 0,
				messagesSkipped: 0,
				historyId: null,
				historyExpired: false
			};
		}

		const scope = {
			provider: EmailProvider.GMAIL,
			organizationId: account.organizationId,
			userId: account.userId
		};

		// State declared in the outer scope so the post-loop log + the recovery branch can
		// read it. Reset at the top of `work` because `withFreshAccessToken` re-runs the
		// whole callback on a mid-call 401 — without reset, counters would compound across
		// the failed attempt + the retry.
		let pagesFetched = 0;
		let messagesInserted = 0;
		let messagesSkipped = 0;
		let newHistoryId: string | null = null;
		let historyExpired = false;

		const work = async (accessToken: string): Promise<void> => {
			pagesFetched = 0;
			messagesInserted = 0;
			messagesSkipped = 0;
			newHistoryId = null;
			historyExpired = false;
			let pageToken: string | undefined;

			while (pagesFetched < MAX_PAGES) {
				let page: GmailHistoryPage;

				try {
					page = await this.api.listHistoryPage(accessToken, {
						startHistoryId: account.historyId!,
						pageToken
					});
				} catch (error) {
					if (!(error instanceof GmailHistoryExpiredException)) {
						throw error;
					}
					// History expired MID-WALK after one or more pages already succeeded +
					// persisted. Mark and break — earlier pages stay in DB; outer recovery
					// re-acquires the cursor so the next push has a starting point. The
					// gap between (last successful page's historyId) and (Gmail's current
					// historyId) is still lost. Acceptable trade-off: we keep partial
					// progress instead of throwing it away.
					historyExpired = true;
					break;
				}

				pagesFetched += 1;
				newHistoryId = page.historyId;

				// Flatten `messagesAdded` across all records on this page. A single history
				// entry can contain multiple added messages (e.g. batch arrival); the same
				// message id can also appear in multiple records — `Set` dedupes.
				const stubIds: string[] = [];
				for (const record of page.history) {
					for (const added of record.messagesAdded ?? []) {
						stubIds.push(added.message.id);
					}
				}
				const uniqueIds = Array.from(new Set(stubIds));

				if (uniqueIds.length > 0) {
					// Fetch + persist this page before moving to the next. Per-page commits
					// mean a mid-walk failure (history expired, network error, etc.) leaves
					// earlier pages safely in the DB rather than discarding the whole batch.
					const fetched = await Promise.all(uniqueIds.map(id => this.api.getMessageFull(accessToken, id)));
					// Filter nulls — `getMessageFull` returns null on 404 (message deleted
					// between the history fire + our fetch). Treat as "skipped"; the cursor
					// still advances past the deletion so we don't get stuck on it.
					const messages = fetched.filter((m): m is NonNullable<typeof m> => m !== null);
					messagesSkipped += fetched.length - messages.length;

					const inserted = await this.persistBatch(emailAccountId, account.organizationId, messages);
					messagesInserted += inserted;
					messagesSkipped += messages.length - inserted;
				}

				if (!page.nextPageToken) {
					break;
				}
				pageToken = page.nextPageToken;
			}
		};

		// `GmailHistoryExpiredException` cannot propagate out of `work` — the inner try/catch
		// around `listHistoryPage` catches it on every iteration (including the first call,
		// the no-pages-yet case) and sets `historyExpired = true; break;`. Other exceptions
		// (5xx, network errors) still propagate up to Inngest which retries the function.
		await this.accounts.withFreshAccessToken(scope, work);

		if (historyExpired) {
			// Re-acquire a fresh cursor via getProfile so the next push has a valid
			// starting point. The gap between our stale cursor and Gmail's current is lost
			// (we don't replay) — acceptable for a rare path (cursor >7 days old).
			this.logService.logAction({
				action: 'email.delta_sync.history_expired',
				message: `Gmail history cursor expired for ${account.email} — re-acquiring`,
				metadata: {
					provider: account.provider,
					emailAccountId,
					previousHistoryId: account.historyId,
					pagesPersistedBeforeExpiry: pagesFetched
				},
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

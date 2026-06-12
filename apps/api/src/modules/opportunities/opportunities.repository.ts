import { Prisma } from '@/generated/prisma/client';
import {
	EmailProvider,
	DismissReason as PrismaDismissReason,
	OpportunityStatus as PrismaOpportunityStatus,
	ReplyDraftKind as PrismaReplyDraftKind,
	ReplyDraftStatus as PrismaReplyDraftStatus,
	Urgency as PrismaUrgency
} from '@/generated/prisma/enums';
import type { ClassifierResult } from '@/modules/ai/classifier/classifier.types';
import type { ExtractorResult, Urgency as ExtractorUrgency } from '@/modules/ai/extractor/extractor.types';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { Injectable, Logger } from '@nestjs/common';

/**
 * Server-side filter for whether `listByOrganization` includes dismissed rows.
 * Default `active` hides them (matches the workflow-funnel mental model). `dismissed`
 * is for the "Toon afgewezen" toggle on the list page. `all` is mostly for tests +
 * the future admin precision panel.
 */
export type OpportunityDismissedFilter = 'active' | 'dismissed' | 'all';

/**
 * Audit-log actions that compose the opportunity-detail timeline. Sourced from
 * `Log.metadata->>'action'` rows where `Log.metadata->>'opportunityId'` matches.
 */
const OPPORTUNITY_TIMELINE_ACTIONS = [
	'opportunity.status.updated',
	'opportunity.auto_cold.flipped',
	'opportunity.dismissed',
	'opportunity.undismissed',
	'opportunity.fields_updated',
	'opportunity.assigned',
	'opportunity.received_via_mailbox',
	'opportunity.quote_created',
	'opportunity.quote_pdf_generated'
] as const;

const TIMELINE_QUERY_CAP = 200;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface RawMessageForOpportunityProcessing {
	id: string;
	emailAccountId: string;
	organizationId: string;
	internalDate: Date;
	subject: string | null;
	fromEmail: string | null;
	fromName: string | null;
	/** Provider thread identifier (Gmail `threadId`, Graph `conversationId`).
	 *  Used for thread reconstitution before the classifier runs. NULL on the rare
	 *  provider edge case where threading info is missing; the pipeline then falls
	 *  through to the regular classifier path. */
	threadId: string | null;
	raw: unknown;
	provider: EmailProvider;
}

const OPPORTUNITY_INCLUDE = {
	rawMessage: {
		select: {
			internalDate: true,
			subject: true,
			fromEmail: true,
			fromName: true,
			threadId: true
		}
	},
	//  follow-up +  — light-weight reply-draft fields used by:
	//  1. `replyDraftSentAt` wire field on every row (drives the dismiss-dialog "you
	//     already sent" warning + the `dismissedAfterSend` audit-log flag). Picks the
	//     latest SENT draft (any historical send "sticks" the warning on, even after
	//     a follow-up draft is composed on top).
	//  2. `isReplyDraftEditable` server-side gate on the autosave / regenerate /
	//     attachments endpoints — needs the LATEST draft's `status`.
	// 1:N relation now (was 1:1). Fetch all drafts ordered by `createdAt DESC`
	// so the mapper can pluck `[0]` for "latest" and `.find(d => d.sentAt)` for "any
	// sent." Typical row has 1-3 drafts; payload cost is negligible.
	replyDrafts: { orderBy: { createdAt: 'desc' }, select: { sentAt: true, status: true, kind: true } }
} as const satisfies Prisma.OpportunityInclude;

/**
 * detail-view include. Extends `OPPORTUNITY_INCLUDE` with the raw provider
 * payload (so we can render the original email body) + the  `ReplyDraft` if
 * generation has completed. Used by `findDetailByIdForOrganization` only — the list
 * endpoint stays on the lighter `OPPORTUNITY_INCLUDE` to avoid hauling email bodies
 * over the wire on every page.
 */
const OPPORTUNITY_DETAIL_INCLUDE = {
	rawMessage: {
		select: {
			internalDate: true,
			subject: true,
			fromEmail: true,
			fromName: true,
			threadId: true,
			raw: true,
			emailAccount: { select: { provider: true } }
		}
	},
	// include the linked AICall's `createdAt` so the FE banner can compare
	// "when was the body last AI-generated" against `tonePlaybookUpdatedAt`. The row's
	// own `createdAt` is stable across regenerations (Prisma `update` doesn't touch
	// it), so the AICall pointer is the right anchor for "what time does this body
	// reflect?". Falls back to `replyDraft.createdAt` on the FE when `aiCallId` is
	// null (best-effort AICall persist failure).
	//  follow-up — include staged attachments. `orderBy createdAt asc` so the UI
	// chip list stays stable across re-renders.
	// 1:N. Fetch all drafts ordered by `createdAt DESC` so the mapper picks
	// `[0]` as the current draft for the editor and `.find(d => d.sentAt)` to compute
	// `replyDraftSentAt`.
	replyDrafts: {
		orderBy: { createdAt: 'desc' },
		include: {
			aiCall: { select: { createdAt: true } },
			attachments: { orderBy: { createdAt: 'asc' } }
		}
	},
	//  follow-up — inbound customer replies attached to this opp via thread
	// reconstitution. Newest-first matches the order the FE wants for the timeline
	// merge. Includes the raw payload so the mapper can extract the plain-text body
	// via `buildRawMessageAIInput`.
	threadMessages: {
		orderBy: { internalDate: 'desc' },
		select: {
			id: true,
			fromName: true,
			fromEmail: true,
			internalDate: true,
			subject: true,
			raw: true,
			wasDetectedAsCloser: true,
			emailAccount: { select: { provider: true } }
		}
	}
} as const satisfies Prisma.OpportunityInclude;

export type OpportunityDetailRecord = Prisma.OpportunityGetPayload<{ include: typeof OPPORTUNITY_DETAIL_INCLUDE }>;

/**
 * Result of `updateReplyDraftBody`. Surfaces just the post-update fields the
 * controller needs to render the next auto-save tick; the full `ReplyDraft` shape comes
 * back from a follow-up read in the service layer.
 */
export interface UpdatedReplyDraftRow {
	draftId: string;
	body: string;
	status: PrismaReplyDraftStatus;
	wasEditedByUser: boolean;
}

/**
 * Shape returned by every read on this repository. Derived from the Prisma generated
 * types + `OPPORTUNITY_INCLUDE`, so adding a column to the Prisma model automatically
 * flows through to consumers without a separate interface to update.
 */
export type OpportunityRecord = Prisma.OpportunityGetPayload<{ include: typeof OPPORTUNITY_INCLUDE }>;

export interface CreateOpportunityFromRawMessageInput {
	rawMessage: RawMessageForOpportunityProcessing;
	classification: ClassifierResult;
	extraction: ExtractorResult;
	aiProvider: string;
	classifiedAiCallId: string | null;
	extractedAiCallId: string | null;
}

const EXTRACTOR_URGENCY_TO_PRISMA: Record<ExtractorUrgency, PrismaUrgency> = {
	emergency: PrismaUrgency.EMERGENCY,
	high: PrismaUrgency.HIGH,
	normal: PrismaUrgency.NORMAL,
	low: PrismaUrgency.LOW
};

/**
 * Poison-message cap: a RawMessage whose pipeline run has failed this many times
 * (malformed payload, prompt that always schema-fails) stops being retried — every
 * scan would otherwise re-burn an OpenAI call on it forever. Capped rows stay
 * unclassified (`classifiedAt` NULL) so a future pipeline fix can sweep them up by
 * resetting `classifyAttempts`.
 */
export const MAX_CLASSIFY_ATTEMPTS = 5;

@Injectable()
export class OpportunitiesRepository {
	private readonly logger = new Logger(OpportunitiesRepository.name);

	constructor(private readonly prisma: PrismaService) {}

	async findPendingRawMessagesForAccount(
		emailAccountId: string,
		limit: number,
		excludedIds: readonly string[]
	): Promise<RawMessageForOpportunityProcessing[]> {
		const rawMessages = await this.prisma.rawMessage.findMany({
			where: {
				emailAccountId,
				classifiedAt: null,
				classifyAttempts: { lt: MAX_CLASSIFY_ATTEMPTS },
				...(excludedIds.length > 0 ? { id: { notIn: [...excludedIds] } } : {})
			},
			orderBy: { internalDate: 'asc' },
			take: limit,
			select: {
				id: true,
				emailAccountId: true,
				organizationId: true,
				internalDate: true,
				subject: true,
				fromEmail: true,
				fromName: true,
				threadId: true,
				raw: true,
				emailAccount: { select: { provider: true } }
			}
		});

		return rawMessages.map(rawMessage => ({
			id: rawMessage.id,
			emailAccountId: rawMessage.emailAccountId,
			organizationId: rawMessage.organizationId,
			internalDate: rawMessage.internalDate,
			subject: rawMessage.subject,
			fromEmail: rawMessage.fromEmail,
			fromName: rawMessage.fromName,
			threadId: rawMessage.threadId,
			raw: rawMessage.raw,
			provider: rawMessage.emailAccount.provider
		}));
	}

	async findOrganizationIdForEmailAccount(emailAccountId: string): Promise<string | null> {
		const row = await this.prisma.emailAccount.findUnique({
			where: { id: emailAccountId },
			select: { organizationId: true }
		});
		return row?.organizationId ?? null;
	}

	/**
	 * Self-email filter source data. Returns every email address ever
	 * connected to the organization (Gmail + Microsoft, both currently-connected AND
	 * soft-disconnected per ). Used by the pipeline to short-circuit any inbound
	 * RawMessage whose `From` matches the org's own connected mailboxes — those are
	 * our own outbound emails landing in another connected inbox, not real leads.
	 * Lower-cased so callers can do case-insensitive `has` lookups without further
	 * normalization. Returns a `Set` so membership checks are O(1) per RawMessage.
	 */
	async findOrganizationEmailAddresses(organizationId: string): Promise<Set<string>> {
		const rows = await this.prisma.emailAccount.findMany({
			where: { organizationId },
			select: { email: true }
		});
		return new Set(rows.map(r => r.email.toLowerCase()));
	}

	/**
	 * Thread reconstitution. Look up an existing Opportunity in the same org
	 * whose originating RawMessage has the given threadId. Only matches non-dismissed
	 * rows so a customer reply on a thread the owner already dismissed (NOT_A_QUOTE,
	 * SPAM, etc.) falls through to the classifier path — the owner's correction sticks.
	 * Returns just the columns the pipeline needs to fire the follow-up event; the
	 * caller can fetch a fuller record afterward if needed.
	 */
	async findOpportunityForThread(
		organizationId: string,
		threadId: string
	): Promise<{ id: string; status: PrismaOpportunityStatus } | null> {
		return this.prisma.opportunity.findFirst({
			where: {
				organizationId,
				dismissedAt: null,
				rawMessage: { threadId }
			},
			select: { id: true, status: true }
		});
	}

	// Context needed to render an Opportunity notification (in-app body + email template):
	// who owns the mailbox the conversation lives in + the customer/request labels.
	// Returns null when the opp or its emailAccount.user is missing — caller treats
	// that as "skip notification" (delivery is best-effort).
	async findOpportunityNotificationContext(opportunityId: string): Promise<{
		opportunityId: string;
		organizationId: string;
		customerName: string | null;
		requestType: string;
		urgency: PrismaUrgency;
		customerDeadline: Date | null;
		emailSubject: string | null;
		mailboxUserId: string | null;
	} | null> {
		const opp = await this.prisma.opportunity.findUnique({
			where: { id: opportunityId },
			select: {
				id: true,
				organizationId: true,
				customerName: true,
				requestType: true,
				urgency: true,
				customerDeadline: true,
				rawMessage: { select: { subject: true, fromName: true } },
				emailAccount: { select: { userId: true } }
			}
		});
		if (!opp) {
			return null;
		}
		return {
			opportunityId: opp.id,
			organizationId: opp.organizationId,
			customerName: opp.customerName ?? opp.rawMessage.fromName,
			requestType: opp.requestType,
			urgency: opp.urgency,
			customerDeadline: opp.customerDeadline,
			emailSubject: opp.rawMessage.subject,
			mailboxUserId: opp.emailAccount?.userId ?? null
		};
	}

	/**
	 * Attach a historical thread message to an Opportunity. Used by the
	 * thread-as-unit backfill flow: when a thread is processed for the first time, the
	 * "originating message" (newest positive) creates the opp, and all the OTHER messages
	 * in the thread attach via this method as immutable history. No opp.status reset
	 * here — the opp was just freshly created in NEW; we don't want to wastefully bump
	 * its updatedAt N times nor flip it back to NEW for already-NEW opps.
	 * Single mutation (vs. the transaction in `attachFollowupMessage`): only the
	 * RawMessage row is touched. Idempotency is at the call-site level (only call this
	 * for messages whose `classifiedAt IS NULL` and which belong to the same thread as
	 * the originating message).
	 */
	async attachThreadMessage(input: {
		rawMessageId: string;
		opportunityId: string;
		/**
		 * Internal date of the attaching RawMessage. When set, the opp's
		 * `latestCustomerRawMessageId` advances to this message if it's strictly newer
		 * than the current pointer. `null` to skip the update — used by callers that
		 * already know this attach is a self-email (own-mailbox outbound) and shouldn't
		 * count as customer activity.
		 */
		customerInternalDate: Date | null;
	}): Promise<void> {
		const now = new Date();
		await this.prisma.$transaction(async tx => {
			await tx.rawMessage.update({
				where: { id: input.rawMessageId },
				data: {
					opportunityId: input.opportunityId,
					isQuoteRequest: true,
					classifiedAt: now
				}
			});
			if (input.customerInternalDate !== null) {
				await this.advanceLatestCustomerPointer(
					tx,
					input.opportunityId,
					input.rawMessageId,
					input.customerInternalDate
				);
			}
		});
	}

	/**
	 * Attach an inbound follow-up RawMessage to an existing Opportunity. Three
	 * mutations in one transaction so the customer-visible state can't disagree with
	 * ours mid-flight:
	 *  1. RawMessage.opportunityId → existing opp (links the conversation),
	 *  2. RawMessage.isQuoteRequest = true + classifiedAt = now (skip the classifier —
	 *     the thread match is a stronger positive signal than a fresh classifier run),
	 *  3. Opportunity.status → NEW (re-promotes the row to the top of the funnel so
	 *     the owner sees the new draft waiting). The user explicitly asked for the
	 *     auto-NEW move; revertible via the fully-open transition policy if undesired.
	 */
	async attachFollowupMessage(input: {
		rawMessageId: string;
		opportunityId: string;
		resetToNew: boolean;
		wasDetectedAsCloser?: boolean;
		/**
		 * Internal date of the attaching RawMessage. Same semantics as
		 * `attachThreadMessage.customerInternalDate`: when set, the opp's
		 * `latestCustomerRawMessageId` advances to this message if it's strictly newer
		 * than the current pointer. Callers pass `null` for own-mailbox outbound
		 * (which by definition isn't a customer message and shouldn't shift the
		 * threading-header source).
		 */
		customerInternalDate: Date | null;
	}): Promise<void> {
		const now = new Date();
		await this.prisma.$transaction(async tx => {
			await tx.rawMessage.update({
				where: { id: input.rawMessageId },
				data: {
					opportunityId: input.opportunityId,
					isQuoteRequest: true,
					classifiedAt: now,
					wasDetectedAsCloser: input.wasDetectedAsCloser ?? false
				}
			});
			// Only flip status when a customer reply lands. Own-org sent copies (Gmail/Graph
			// returning our outbound message via delta-sync) must NOT clobber the
			// markSent → REPLIED transition the ReplyDraftsService just wrote.
			if (input.resetToNew) {
				await tx.opportunity.update({
					where: { id: input.opportunityId },
					data: { status: PrismaOpportunityStatus.NEW }
				});
			}
			if (input.customerInternalDate !== null) {
				await this.advanceLatestCustomerPointer(
					tx,
					input.opportunityId,
					input.rawMessageId,
					input.customerInternalDate
				);
			}
		});
	}

	/**
	 * Move `Opportunity.latestCustomerRawMessageId` forward to `rawMessageId` iff
	 * the candidate's `internalDate` is strictly newer than what we have on file.
	 * Conditional UPDATE (one round-trip; the conditional lives in SQL) — avoids a
	 * read-then-write race when two follow-ups arrive concurrently for the same opp.
	 * Older / same-time candidates are no-ops so out-of-order delta-sync deliveries
	 * never regress the pointer to an earlier message.
	 */
	private async advanceLatestCustomerPointer(
		tx: Prisma.TransactionClient,
		opportunityId: string,
		candidateRawMessageId: string,
		candidateInternalDate: Date
	): Promise<void> {
		await tx.$executeRaw`
			UPDATE "Opportunity" o
			SET "latestCustomerRawMessageId" = ${candidateRawMessageId}::uuid
			WHERE o.id = ${opportunityId}::uuid
			  AND (
			    o."latestCustomerRawMessageId" IS NULL
			    OR (
			      SELECT rm."internalDate"
			      FROM "RawMessage" rm
			      WHERE rm.id = o."latestCustomerRawMessageId"
			    ) < ${candidateInternalDate}
			  )
		`;
	}

	async markRawMessageNegative(rawMessageId: string): Promise<void> {
		await this.prisma.rawMessage.update({
			where: { id: rawMessageId },
			data: { isQuoteRequest: false, classifiedAt: new Date() }
		});
	}

	/**
	 * Record one failed pipeline attempt on a RawMessage and return the new total.
	 * Atomic increment (no read-then-write) so concurrent batches can't lose a count.
	 * The caller logs `raw_message_poisoned` when the total reaches
	 * `MAX_CLASSIFY_ATTEMPTS` — after which `findPendingRawMessagesForAccount` stops
	 * scanning the row.
	 */
	async incrementClassifyAttempts(rawMessageId: string): Promise<number> {
		const updated = await this.prisma.rawMessage.update({
			where: { id: rawMessageId },
			data: { classifyAttempts: { increment: 1 } },
			select: { classifyAttempts: true }
		});
		return updated.classifyAttempts ?? 0;
	}

	// Find REPLIED opportunities eligible to auto-cold. Eligibility:
	//   - status = REPLIED ∧ not dismissed
	//   - org.coldAfterDays > 0 (0 disables the cron for the org)
	//   - latest SENT draft is older than (now − org.coldAfterDays)
	//   - org's silence-check-in budget already spent OR disabled
	//     (priorSentCheckIns >= followUpMaxCount, including the followUpMaxCount = 0 case)
	//   - NO unsent draft exists (PENDING_APPROVAL / EDITED) — the owner is actively
	//     working on a reply, or a check-in is queued; cooling now would be wrong.
	// Returns the list of opportunity ids to flip; caller writes the status update
	// + audit log per opp. Raw SQL because the conditions span the per-org config table
	// + a correlated draft aggregate.
	async findColdCandidates(
		now: Date,
		batchCap: number
	): Promise<
		Array<{
			opportunityId: string;
			organizationId: string;
			latestSentAt: Date;
			coldAfterDays: number;
			customerName: string | null;
			requestType: string;
			mailboxUserId: string | null;
		}>
	> {
		const rows = await this.prisma.$queryRaw<
			Array<{
				opportunityId: string;
				organizationId: string;
				latestSentAt: Date;
				coldAfterDays: number;
				customerName: string | null;
				requestType: string;
				mailboxUserId: string | null;
			}>
		>(Prisma.sql`
			WITH latest_sent AS (
				SELECT
					rd."opportunityId" AS "opportunityId",
					MAX(rd."sentAt")    AS "latestSentAt",
					COUNT(*) FILTER (
						WHERE rd."kind" = ${PrismaReplyDraftKind.CHECK_IN}::"ReplyDraftKind"
					)                    AS "priorCheckInCount"
				FROM "ReplyDraft" rd
				WHERE rd."status" = ${PrismaReplyDraftStatus.SENT}::"ReplyDraftStatus"
				GROUP BY rd."opportunityId"
			)
			SELECT
				o."id"                AS "opportunityId",
				o."organizationId"    AS "organizationId",
				ls."latestSentAt"     AS "latestSentAt",
				org."coldAfterDays"   AS "coldAfterDays",
				o."customerName"      AS "customerName",
				o."requestType"       AS "requestType",
				ea."userId"           AS "mailboxUserId"
			FROM "Opportunity" o
			JOIN "Organization" org ON org."id" = o."organizationId"
			JOIN latest_sent ls     ON ls."opportunityId" = o."id"
			LEFT JOIN "EmailAccount" ea ON ea."id" = o."emailAccountId"
			WHERE o."status" = ${PrismaOpportunityStatus.REPLIED}::"OpportunityStatus"
			  AND o."dismissedAt" IS NULL
			  AND org."coldAfterDays" > 0
			  AND ${now} - ls."latestSentAt" >= make_interval(days => org."coldAfterDays")
			  AND ls."priorCheckInCount" >= org."followUpMaxCount"
			  AND NOT EXISTS (
			      SELECT 1 FROM "ReplyDraft" rd2
			      WHERE rd2."opportunityId" = o."id"
			        AND rd2."status" IN (${PrismaReplyDraftStatus.PENDING_APPROVAL}::"ReplyDraftStatus",
			                             ${PrismaReplyDraftStatus.EDITED}::"ReplyDraftStatus")
			  )
			ORDER BY ls."latestSentAt" ASC
			LIMIT ${batchCap}
		`);
		return rows;
	}

	/**
	 * Flip eligible REPLIED opportunities to COLD. Returns the IDs that ACTUALLY
	 * flipped (a subset of the input if a candidate's status changed between the
	 * `findColdCandidates` snapshot and this write — e.g. the owner clicked WON in
	 * the gap). Caller iterates the returned set for notifications + audit logs so
	 * side-effects can't fire for an opp that didn't actually cool.
	 */
	async markOpportunitiesCold(opportunityIds: ReadonlyArray<string>): Promise<string[]> {
		if (opportunityIds.length === 0) {
			return [];
		}
		const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
			UPDATE "Opportunity"
			SET "status" = ${PrismaOpportunityStatus.COLD}::"OpportunityStatus"
			WHERE "id" = ANY(${opportunityIds as string[]}::uuid[])
			  AND "status" = ${PrismaOpportunityStatus.REPLIED}::"OpportunityStatus"
			RETURNING "id"
		`);
		return rows.map(r => r.id);
	}

	async createOpportunityFromRawMessage(input: CreateOpportunityFromRawMessageInput): Promise<{
		created: boolean;
		opportunityId: string | null;
		mailbox: { email: string; userId: string | null; ownerName: string | null } | null;
	}> {
		return this.prisma.$transaction(async tx => {
			// Default assignee = the mailbox owner. The user who connected the inbox is
			// the natural workflow owner of opps that surface from it; they can reassign
			// from the detail view if they want to redistribute work. `EmailAccount.userId`
			// is nullable (ON DELETE SET NULL on the User FK) — leave the opp unassigned
			// in that edge case rather than throwing.
			// Selecting `email` + `user.name` in the same query so the caller can write
			// the "Aanvraag binnengekomen via <mailbox>" audit row without a second round-
			// trip.
			const mailbox = await tx.emailAccount.findUnique({
				where: { id: input.rawMessage.emailAccountId },
				select: {
					email: true,
					userId: true,
					user: { select: { name: true, email: true } }
				}
			});
			const assignedToUserId = mailbox?.userId ?? null;
			const mailboxOwnerName = mailbox?.user?.name?.trim() || mailbox?.user?.email || null;

			const result = await tx.opportunity.createMany({
				data: [
					{
						organizationId: input.rawMessage.organizationId,
						emailAccountId: input.rawMessage.emailAccountId,
						rawMessageId: input.rawMessage.id,
						// At creation, the originating IS the only customer message → it's
						// also the latest. Subsequent followup attaches bump this forward
						// when newer customer messages land on the thread.
						latestCustomerRawMessageId: input.rawMessage.id,
						status: PrismaOpportunityStatus.NEW,
						aiProvider: input.aiProvider,
						classifiedAiCallId: input.classifiedAiCallId,
						extractedAiCallId: input.extractedAiCallId,
						classifierConfidence: input.classification.confidence,
						classifierReason: input.classification.reason,
						customerName: input.extraction.customerName,
						customerEmail: input.extraction.customerEmail,
						address: input.extraction.address,
						requestType: input.extraction.requestType,
						urgency: EXTRACTOR_URGENCY_TO_PRISMA[input.extraction.urgency],
						customerDeadline: parseDateOnly(input.extraction.customerDeadline),
						customerAppointment: parseDateOnly(input.extraction.customerAppointment),
						deliverableHints: input.extraction.deliverableHints,
						assignedToUserId
					}
				],
				skipDuplicates: true
			});

			await tx.rawMessage.update({
				where: { id: input.rawMessage.id },
				data: { isQuoteRequest: true, classifiedAt: new Date() }
			});

			const created = result.count > 0;
			// caller needs the new row's ID to emit the `opportunity/created`
			// event. We do the lookup inside the same transaction (cheap, single-row,
			// `rawMessageId` is unique) so a downstream consumer can't see a half-state.
			// When `created === false` we skip the lookup — caller has nothing to fire.
			if (!created) {
				return { created: false, opportunityId: null, mailbox: null };
			}

			const inserted = await tx.opportunity.findUnique({
				where: { rawMessageId: input.rawMessage.id },
				select: { id: true }
			});

			return {
				created: true,
				opportunityId: inserted?.id ?? null,
				mailbox: mailbox ? { email: mailbox.email, userId: mailbox.userId, ownerName: mailboxOwnerName } : null
			};
		});
	}

	async listByOrganization(
		organizationId: string,
		options: {
			take: number;
			cursor: { createdAt: Date; id: string } | null;
			status: PrismaOpportunityStatus | null;
			search: string | null;
			/** defaults to `active` (hides dismissed) when omitted. */
			dismissed?: OpportunityDismissedFilter;
			/** when set, restricts to opps where `EmailAccount.userId === userId`. */
			owner?: { userId: string } | null;
			/** when set, filters by assignment: a specific user or unassigned-only. */
			assignee?: { kind: 'user'; userId: string } | { kind: 'unassigned' } | null;
		}
	): Promise<OpportunityRecord[]> {
		// Keyset pagination on (createdAt DESC, id DESC) — id breaks createdAt ties so the
		// cursor is stable across rows created in the same millisecond. We over-fetch by 1
		// row so the service can tell whether a next page exists without a separate count.
		// Status filter + search OR-clause (optional) apply at SQL level so cursor + filters
		// cohabit cleanly. The two OR-clauses (search + keyset) live under `AND` so neither
		// overwrites the other in Prisma's where-shape merge.
		const search = options.search?.trim();
		const conditions: Prisma.OpportunityWhereInput[] = [];
		if (search) {
			conditions.push({
				OR: [
					{ customerName: { contains: search, mode: 'insensitive' } },
					{ address: { contains: search, mode: 'insensitive' } },
					{ requestType: { contains: search, mode: 'insensitive' } },
					{ rawMessage: { is: { fromName: { contains: search, mode: 'insensitive' } } } },
					{ rawMessage: { is: { subject: { contains: search, mode: 'insensitive' } } } }
				]
			});
		}
		if (options.cursor) {
			conditions.push({
				OR: [
					{ createdAt: { lt: options.cursor.createdAt } },
					{ createdAt: options.cursor.createdAt, id: { lt: options.cursor.id } }
				]
			});
		}

		const dismissedFilter = options.dismissed ?? 'active';

		return this.prisma.opportunity.findMany({
			where: {
				organizationId,
				...(options.status ? { status: options.status } : {}),
				...(dismissedFilter === 'active' ? { dismissedAt: null } : {}),
				...(dismissedFilter === 'dismissed' ? { dismissedAt: { not: null } } : {}),
				...(options.owner ? { emailAccount: { is: { userId: options.owner.userId } } } : {}),
				...(options.assignee?.kind === 'user' ? { assignedToUserId: options.assignee.userId } : {}),
				...(options.assignee?.kind === 'unassigned' ? { assignedToUserId: null } : {}),
				...(conditions.length > 0 ? { AND: conditions } : {})
			},
			orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
			take: options.take,
			include: OPPORTUNITY_INCLUDE
		});
	}

	/**
	 * Per-status counts for the org. Drives the segmented filter tabs ("New (12) ·
	 * Replied (8) · ..."). Single SQL aggregation across all 6 statuses.
	 * dismissed rows are excluded so the tab counts stay honest as a workflow
	 * funnel. Showing the "Toon afgewezen" view in the UI does not change these
	 * totals — that view filters the list, not the counts. `owner` + `assignee`
	 * filters DO apply to the counts so the tab totals match the visible rows.
	 */
	async countByStatusForOrganization(
		organizationId: string,
		filters: {
			owner?: { userId: string } | null;
			assignee?: { kind: 'user'; userId: string } | { kind: 'unassigned' } | null;
		} = {}
	): Promise<Record<PrismaOpportunityStatus, number>> {
		const rows = await this.prisma.opportunity.groupBy({
			by: ['status'],
			where: {
				organizationId,
				dismissedAt: null,
				...(filters.owner ? { emailAccount: { is: { userId: filters.owner.userId } } } : {}),
				...(filters.assignee?.kind === 'user' ? { assignedToUserId: filters.assignee.userId } : {}),
				...(filters.assignee?.kind === 'unassigned' ? { assignedToUserId: null } : {})
			},
			_count: { _all: true }
		});
		const result = {
			[PrismaOpportunityStatus.NEW]: 0,
			[PrismaOpportunityStatus.REPLIED]: 0,
			[PrismaOpportunityStatus.WAITING]: 0,
			[PrismaOpportunityStatus.COLD]: 0,
			[PrismaOpportunityStatus.WON]: 0,
			[PrismaOpportunityStatus.LOST]: 0
		};
		for (const row of rows) {
			result[row.status] = row._count._all;
		}
		return result;
	}

	async findByIdForOrganization(organizationId: string, id: string): Promise<OpportunityRecord | null> {
		return this.prisma.opportunity.findFirst({
			where: { id, organizationId },
			include: OPPORTUNITY_INCLUDE
		});
	}

	/**
	 * fetch a single opportunity with everything the detail view + draft editor
	 * needs: raw provider payload (for original-email rendering), email-account provider
	 * (for plain-text extraction routing), and the reply draft row (if generation
	 * has completed).
	 */
	async findDetailByIdForOrganization(organizationId: string, id: string): Promise<OpportunityDetailRecord | null> {
		return this.prisma.opportunity.findFirst({
			where: { id, organizationId },
			include: OPPORTUNITY_DETAIL_INCLUDE
		});
	}

	/**
	 * Fetch the audit-log rows that compose the opportunity timeline (status changes,
	 * dismiss/undismiss, auto-cold flips). Filtered by `organizationId` for tenant
	 * isolation + `metadata->>'opportunityId'` for the row. Newest-first; cap protects
	 * against runaway logs.
	 */
	async findTimelineEvents(
		organizationId: string,
		opportunityId: string
	): Promise<Array<{ id: string; createdAt: Date; metadata: Record<string, unknown> }>> {
		const rows = await this.prisma.log.findMany({
			where: {
				organizationId,
				AND: [
					{ metadata: { path: ['opportunityId'], equals: opportunityId } },
					{
						OR: OPPORTUNITY_TIMELINE_ACTIONS.map(action => ({
							metadata: { path: ['action'], equals: action }
						}))
					}
				]
			},
			orderBy: { createdAt: 'desc' },
			take: TIMELINE_QUERY_CAP,
			select: { id: true, createdAt: true, metadata: true }
		});

		return rows
			.filter((row): row is typeof row & { metadata: Record<string, unknown> } => isRecord(row.metadata))
			.map(row => ({ id: row.id, createdAt: row.createdAt, metadata: row.metadata }));
	}

	/**
	 * For each opportunity ID, find the most recent owner-driven audit-log entry +
	 * its actor. Source action set matches `OPPORTUNITY_TIMELINE_ACTIONS` minus the
	 * system-driven `auto_cold.flipped` (no actor on those). Returns a map keyed by
	 * opportunityId with `{ actorUserId, at }`. Caller resolves user IDs to display
	 * labels in a separate batched query.
	 */
	async findLatestEditorPerOpportunity(
		organizationId: string,
		opportunityIds: ReadonlyArray<string>
	): Promise<Map<string, { actorUserId: string; at: Date }>> {
		if (opportunityIds.length === 0) {
			return new Map();
		}
		const rows = await this.prisma.$queryRaw<
			Array<{ opportunityId: string; actorUserId: string | null; createdAt: Date }>
		>(Prisma.sql`
			SELECT DISTINCT ON (metadata->>'opportunityId')
				metadata->>'opportunityId' AS "opportunityId",
				metadata->>'actorUserId'   AS "actorUserId",
				"createdAt"
			FROM "Log"
			WHERE "organizationId" = ${organizationId}::uuid
			  AND metadata->>'opportunityId' = ANY(${opportunityIds as string[]})
			  AND metadata->>'action' IN (
			      'opportunity.status.updated',
			      'opportunity.dismissed',
			      'opportunity.undismissed',
			      'opportunity.fields_updated',
			      'opportunity.assigned'
			  )
			ORDER BY metadata->>'opportunityId', "createdAt" DESC
		`);
		const result = new Map<string, { actorUserId: string; at: Date }>();
		for (const row of rows) {
			if (row.actorUserId !== null) {
				result.set(row.opportunityId, { actorUserId: row.actorUserId, at: row.createdAt });
			}
		}
		return result;
	}

	/**
	 * Resolve a set of user IDs to display labels (`name` if present, else `email`).
	 * Used by the timeline mapper to surface "door <X>" on owner-driven events. One
	 * batched query rather than N joins on the Log fetch. Unknown IDs are silently
	 * dropped — caller renders `null` for them.
	 */
	async findUserDisplayLabels(userIds: ReadonlyArray<string>): Promise<Map<string, string>> {
		if (userIds.length === 0) {
			return new Map();
		}
		const rows = await this.prisma.user.findMany({
			where: { id: { in: userIds as string[] } },
			select: { id: true, name: true, email: true }
		});
		const labels = new Map<string, string>();
		for (const row of rows) {
			labels.set(row.id, row.name?.trim() || row.email);
		}
		return labels;
	}

	async updateStatus(id: string, status: PrismaOpportunityStatus): Promise<OpportunityRecord> {
		return this.prisma.opportunity.update({
			where: { id },
			data: { status },
			include: OPPORTUNITY_INCLUDE
		});
	}

	/**
	 * Patch the owner-editable extracted fields. Caller validated the partial payload
	 * already; this writes through the union of provided keys + returns the refreshed
	 * row for the wire-format mapper. Undefined values are stripped before reaching
	 * Prisma so untouched columns stay put; explicit `null` is preserved as a clear.
	 */
	async updateEditableFields(
		id: string,
		patch: {
			urgency?: PrismaUrgency;
			address?: string | null;
			customerDeadline?: Date | null;
			customerAppointment?: Date | null;
		}
	): Promise<OpportunityRecord> {
		const data: Prisma.OpportunityUpdateInput = {};
		if (patch.urgency !== undefined) {
			data.urgency = patch.urgency;
		}
		if (patch.address !== undefined) {
			data.address = patch.address;
		}
		if (patch.customerDeadline !== undefined) {
			data.customerDeadline = patch.customerDeadline;
		}
		if (patch.customerAppointment !== undefined) {
			data.customerAppointment = patch.customerAppointment;
		}

		return this.prisma.opportunity.update({
			where: { id },
			data,
			include: OPPORTUNITY_INCLUDE
		});
	}

	/**
	 * Soft-disable the opportunity with a reason + actor. Idempotent at the
	 * write level — re-dismissing with the same reason still bumps `dismissedAt` so
	 * the audit timeline shows the latest decision, but the row is otherwise unchanged.
	 */
	async dismiss(id: string, reason: PrismaDismissReason, actorUserId: string): Promise<OpportunityRecord> {
		return this.prisma.opportunity.update({
			where: { id },
			data: {
				dismissedAt: new Date(),
				dismissReason: reason,
				dismissedById: actorUserId
			},
			include: OPPORTUNITY_INCLUDE
		});
	}

	/**
	 * Un-dismiss: clear all three columns atomically. Used when the owner
	 * regrets a dismiss action.
	 */
	async undismiss(id: string): Promise<OpportunityRecord> {
		return this.prisma.opportunity.update({
			where: { id },
			data: {
				dismissedAt: null,
				dismissReason: null,
				dismissedById: null
			},
			include: OPPORTUNITY_INCLUDE
		});
	}

	/**
	 * Set or clear the assignee. Caller has already validated that `userId` (when
	 * non-null) belongs to a member of the opp's org. Idempotent: re-assigning the
	 * same user is a Prisma no-op.
	 */
	async assignOpportunity(id: string, userId: string | null): Promise<OpportunityRecord> {
		return this.prisma.opportunity.update({
			where: { id },
			data: { assignedToUserId: userId },
			include: OPPORTUNITY_INCLUDE
		});
	}

	/**
	 * Verify a user is a member of the given org. Used by `assign` to reject cross-
	 * tenant assignments before writing.
	 */
	async isUserMemberOfOrganization(userId: string, organizationId: string): Promise<boolean> {
		const row = await this.prisma.membership.findFirst({
			where: { userId, organizationId },
			select: { id: true }
		});
		return row !== null;
	}

	/**
	 * Update the reply-draft body for an opportunity. Flips
	 * `wasEditedByUser = true` permanently once the body diverges from `originalBody`
	 * ( /  use this flag); status transitions `PENDING_APPROVAL` → `EDITED` on
	 * the same first divergence. Idempotent: re-submitting the same body that's already
	 * stored is a no-op write (Prisma still touches `updatedAt`, but the flag stays
	 * stable).
	 * Returns `null` when no draft exists for the opportunity — caller surfaces 404.
	 */
	async updateReplyDraftBody(opportunityId: string, body: string): Promise<UpdatedReplyDraftRow | null> {
		// Operate on the LATEST draft (was: unique-by-opportunityId). Picks by
		// `createdAt DESC` so autosave targets the most recent draft when a follow-up
		// exists. The service-layer editability gate already blocks autosave on SENT
		// drafts, so we don't need to filter by status here.
		const existing = await this.prisma.replyDraft.findFirst({
			where: { opportunityId },
			orderBy: { createdAt: 'desc' },
			select: { id: true, originalBody: true, wasEditedByUser: true, status: true }
		});

		if (!existing) {
			return null;
		}

		const diverges = body !== existing.originalBody;
		// Conditional write (`status != SENT` in the WHERE, not just in the read above):
		// an autosave racing a concurrent send could otherwise overwrite the stored copy
		// of an email the customer already received. The read-then-write gap is real —
		// the service-layer editability check uses the same stale read.
		const { count } = await this.prisma.replyDraft.updateMany({
			where: { id: existing.id, status: { not: PrismaReplyDraftStatus.SENT } },
			data: {
				body,
				// Only flip the flag forward — once edited, it stays edited even if the
				// user later reverts the text back to the AI baseline. That matches the
				// metric's intent : "did the owner touch this draft at all?"
				wasEditedByUser: existing.wasEditedByUser || diverges,
				// Same forward-only transition for status — once EDITED, don't fall back
				// to PENDING_APPROVAL even on revert. SENT is terminal (set by ).
				status:
					diverges || existing.status === PrismaReplyDraftStatus.EDITED
						? PrismaReplyDraftStatus.EDITED
						: PrismaReplyDraftStatus.PENDING_APPROVAL
			}
		});

		// Lost the race (draft flipped to SENT between read and write): return the fresh
		// row untouched so the caller renders the sent state rather than a 404/500.
		const fresh = await this.prisma.replyDraft.findUnique({
			where: { id: existing.id },
			select: { id: true, body: true, status: true, wasEditedByUser: true }
		});
		if (!fresh) {
			return null;
		}
		if (count === 0) {
			this.logger.warn(
				`Autosave skipped for draft ${existing.id} on opportunity ${opportunityId} — draft was sent concurrently`
			);
		}

		return {
			draftId: fresh.id,
			body: fresh.body,
			status: fresh.status,
			wasEditedByUser: fresh.wasEditedByUser
		};
	}
}

function parseDateOnly(value: string | null): Date | null {
	if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		return null;
	}

	const parsed = new Date(`${value}T00:00:00.000Z`);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

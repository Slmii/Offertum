import { Prisma } from '@/generated/prisma/client';
import {
	EmailProvider,
	OpportunityStatus as PrismaOpportunityStatus,
	ReplyDraftKind as PrismaReplyDraftKind,
	ReplyDraftStatus as PrismaReplyDraftStatus
} from '@/generated/prisma/enums';
import { daysToMs } from '@/lib/time/duration';
import { ENTITLED_STRIPE_STATUSES } from '@/modules/billing/billing.constants';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

const REPLY_DRAFT_INCLUDE = {
	opportunity: {
		select: {
			id: true,
			organizationId: true,
			customerName: true,
			customerEmail: true,
			address: true,
			requestType: true,
			urgency: true,
			customerDeadline: true,
			customerAppointment: true,
			deliverableHints: true,
			rawMessage: {
				select: {
					subject: true,
					fromName: true,
					fromEmail: true,
					raw: true
				}
			}
		}
	}
} as const satisfies Prisma.ReplyDraftInclude;

/**
 * Shape returned by every read on this repository. Derived from Prisma's generated types
 * so adding a column to the schema flows through without a separate interface update.
 */
export type ReplyDraftRecord = Prisma.ReplyDraftGetPayload<{ include: typeof REPLY_DRAFT_INCLUDE }>;

/**
 * Result returned by the generator-call → persist flow. Shape mirrors the Prisma
 * `Opportunity` fields the generator needs as input.
 */
export interface OpportunityForReplyDraft {
	id: string;
	organizationId: string;
	customerName: string | null;
	address: string | null;
	requestType: string;
	urgency: 'EMERGENCY' | 'HIGH' | 'NORMAL' | 'LOW';
	customerDeadline: Date | null;
	customerAppointment: Date | null;
	deliverableHints: unknown;
	/** The ORIGINATING customer message that created the opportunity. */
	rawMessage: RawMessageForReplyDraft;
	/**
	 *  bug-fix — Latest customer reply attached to this opportunity (via
	 * `RawMessage.opportunityId`), if any. The follow-up draft generator uses this
	 * as its primary `bodyText` so the AI responds to what the customer just said,
	 * not the originating quote request. `null` when no customer reply has landed
	 * yet (typical for the user-driven "Concept-vervolg opstellen" path on a
	 * just-sent draft without an inbound response).
	 */
	latestThreadMessage: RawMessageForReplyDraft | null;
	/**
	 * The User who owns the EmailAccount that received this opportunity's original
	 * message. Used as the SECOND-PRIORITY sign-off name when there's no requesting
	 * user with a name set (auto-generated drafts on opp-create, customer-reply
	 * follow-ups, scheduler check-ins). Falls back to the org name in the prompt
	 * if this is also null. Replaces the prior "owner of the org" fallback so the
	 * draft signs as the person whose inbox the conversation actually lives in, not
	 * the org's billing-owner (which might be a different person).
	 * Note: this is the NAME source only. The writing-style playbook is NEVER pulled
	 * from the mailbox user — only the requesting user's playbook is honored, else
	 * the generic Dutch baseline. The mailbox user's playbook field exists but isn't
	 * authored on their behalf.
	 * `null` only in the defensive case where the EmailAccount was deleted between
	 * opp-creation and draft-generation — shouldn't happen in normal operation given
	 * the FK cascade.
	 */
	mailboxUser: { id: string; name: string | null } | null;
}

export interface RawMessageForReplyDraft {
	subject: string | null;
	fromName: string | null;
	fromEmail: string | null;
	raw: unknown;
	provider: EmailProvider;
}

/**
 * Voice fields for the requesting user — only `findUserForVoice` populates this now.
 *  The previous "fall back to org OWNER's playbook" path was dropped
 * because it baked one person's voice into every team member's drafts. Today: either
 * the requesting user has a playbook → use it, or they don't → generic Dutch baseline.
 * The mailbox-user's NAME (not their playbook) provides the sign-off fallback.
 */
export interface UserVoice {
	userId: string;
	name: string | null;
	tonePlaybookText: string | null;
}

/**
 * Input for `createIfAbsent` (initial draft, ) and `createFollowup` (follow-up
 * draft, ). Same payload shape — the methods differ in their pre-flight checks.
 */
export interface CreateReplyDraftInput {
	opportunityId: string;
	body: string;
	aiCallId: string | null;
	/** tag scheduler-generated check-ins. Defaults to REPLY. */
	kind?: PrismaReplyDraftKind;
}

/**
 * Candidate row for the follow-up scheduler. One per opportunity that's
 * eligible for a fresh check-in this tick. Owner+org settings are denormalised into
 * the row so the processor can re-check conditions without a second query.
 */
export interface CheckInCandidate {
	opportunityId: string;
	organizationId: string;
	cadenceDays: number;
	maxCount: number;
	lastSentAt: Date;
	priorCheckInCount: number;
}

/** Input for `overwriteAfterRegenerate` — same shape as the create path. */
export interface OverwriteAfterRegenerateInput {
	opportunityId: string;
	body: string;
	aiCallId: string | null;
}

/** Result of `overwriteAfterRegenerate` — `false` when refusing to overwrite a SENT draft. */
export interface OverwriteAfterRegenerateResult {
	overwrote: boolean;
}

/** Result of `markSent` — surfaces the persisted `sentAt` so the caller can echo it. */
export interface MarkSentResult {
	draftSentAt: Date;
}

/**
 * Everything `ReplyDraftsService.send` needs in one round-trip. Composed of tightly-
 * coupled sub-rows so the consumer can read each axis (draft / opportunity / mailbox /
 * customer / attachments) without re-fetching.
 */
export interface SendContext {
	draftId: string;
	body: string;
	status: PrismaReplyDraftStatus;
	opportunity: SendContextOpportunity;
	emailAccount: SendContextEmailAccount;
	rawMessage: SendContextRawMessage;
	/** Latest inbound thread message — `null` if no follow-up has arrived. */
	latestThreadMessage: SendContextLatestThreadMessage | null;
	attachments: SendContextAttachment[];
}

export interface SendContextOpportunity {
	id: string;
	organizationId: string;
	status: string;
}

export interface SendContextEmailAccount {
	id: string;
	provider: EmailProvider;
	email: string;
	inboxOwnerUserId: string | null;
	inboxOwnerName: string | null;
}

export interface SendContextRawMessage {
	subject: string | null;
	fromEmail: string | null;
	fromName: string | null;
	raw: unknown;
	threadId: string | null;
}

/**
 * Latest inbound message on the opp's thread, used by the send path to source
 * the threading headers (`Message-ID` → `In-Reply-To`, accumulated `References`).
 * RFC 2822 threading is anchored on the LATEST message in the conversation, not
 * the originating one — using `rawMessage` here (the originating) would make every
 * follow-up reply land at the top of the thread in the recipient's mail client
 * instead of nested under the message it actually answers. `null` when no
 * follow-up has arrived yet (then the originating's headers are correct).
 */
export interface SendContextLatestThreadMessage {
	raw: unknown;
}

/**
 *  follow-up — attachment metadata the send path needs. Binary bytes live in the
 * storage backend; the service loads them via `AttachmentStorage.get(storageKey)`
 * just before composing the provider envelope.
 */
export interface SendContextAttachment {
	id: string;
	filename: string;
	contentType: string;
	sizeBytes: number;
	storageKey: string;
}

@Injectable()
export class ReplyDraftsRepository {
	constructor(private readonly prisma: PrismaService) {}

	/** Fetch everything the AI generator needs to compose a draft for an opportunity. */
	async findOpportunityForGeneration(opportunityId: string): Promise<OpportunityForReplyDraft | null> {
		const opportunity = await this.prisma.opportunity.findUnique({
			where: { id: opportunityId },
			select: {
				id: true,
				organizationId: true,
				rawMessageId: true,
				latestCustomerRawMessageId: true,
				customerName: true,
				address: true,
				requestType: true,
				urgency: true,
				customerDeadline: true,
				customerAppointment: true,
				deliverableHints: true,
				// mailbox user (who connected the inbox this opp lives in)
				// surfaces as the second-priority sign-off name when there's no requesting
				// user with a name. Replaces the prior "org OWNER" fallback.
				emailAccount: {
					select: {
						user: { select: { id: true, name: true } }
					}
				},
				rawMessage: {
					select: {
						subject: true,
						fromName: true,
						fromEmail: true,
						raw: true,
						emailAccount: { select: { provider: true } }
					}
				},
				// Direct pointer to the newest customer-side thread message (maintained
				// by attach paths). Drives the follow-up draft generator's `bodyText` so
				// the AI responds to the customer's most recent words. When equal to
				// `rawMessageId` (no follow-up yet), we collapse it to `null` below so
				// the generator falls back to `rawMessage` and we don't render the same
				// content under two aliases in the prompt.
				latestCustomerRawMessage: {
					select: {
						subject: true,
						fromName: true,
						fromEmail: true,
						raw: true,
						emailAccount: { select: { provider: true } }
					}
				}
			}
		});

		if (!opportunity) {
			return null;
		}

		// Flatten emailAccount.provider up into rawMessage so the service-layer shape stays
		// neatly nested without an extra level. This matches how OpportunitiesRepository
		// surfaces provider on `RawMessageForOpportunityProcessing`.
		const hasDistinctFollowup =
			opportunity.latestCustomerRawMessage !== null &&
			opportunity.latestCustomerRawMessageId !== opportunity.rawMessageId;
		const latest = hasDistinctFollowup ? opportunity.latestCustomerRawMessage : null;
		return {
			id: opportunity.id,
			organizationId: opportunity.organizationId,
			customerName: opportunity.customerName,
			address: opportunity.address,
			requestType: opportunity.requestType,
			urgency: opportunity.urgency,
			customerDeadline: opportunity.customerDeadline,
			customerAppointment: opportunity.customerAppointment,
			deliverableHints: opportunity.deliverableHints,
			rawMessage: {
				subject: opportunity.rawMessage.subject,
				fromName: opportunity.rawMessage.fromName,
				fromEmail: opportunity.rawMessage.fromEmail,
				raw: opportunity.rawMessage.raw,
				provider: opportunity.rawMessage.emailAccount.provider
			},
			latestThreadMessage: latest
				? {
						subject: latest.subject,
						fromName: latest.fromName,
						fromEmail: latest.fromEmail,
						raw: latest.raw,
						provider: latest.emailAccount.provider
					}
				: null,
			mailboxUser: opportunity.emailAccount?.user
				? { id: opportunity.emailAccount.user.id, name: opportunity.emailAccount.user.name }
				: null
		};
	}

	/**
	 * fetch the requesting user's voice fields. Used by `regenerate` so the
	 * "Regenereer in mijn stijl" button uses *their* playbook, not the org owner's.
	 */
	async findUserForVoice(userId: string): Promise<UserVoice | null> {
		const user = await this.prisma.user.findUnique({
			where: { id: userId },
			select: { id: true, name: true, tonePlaybookText: true }
		});

		if (!user) {
			return null;
		}

		return { userId: user.id, name: user.name, tonePlaybookText: user.tonePlaybookText };
	}

	/**
	 * Overwrite the *current editable* draft with a freshly-generated body.
	 * Differs from `createIfAbsent`:
	 *  - Resets `originalBody` to the new generation (the user is choosing a new
	 *    baseline; the edit-detection prompt should diff against this).
	 *  - Resets `wasEditedByUser = false` (the new draft hasn't been touched yet).
	 *  - Resets `status = PENDING_APPROVAL`.
	 *  - Refuses to overwrite when the latest draft is `SENT` — the email is already out
	 *    the door and there's nothing to "regenerate." Returns null in that case so the
	 *    caller can surface 409.
	 * Operates on the LATEST draft for the opp (1:N). Picks by `createdAt DESC`
	 * so the follow-up flow (multiple drafts) regenerates the most recent unsent one.
	 */
	async overwriteAfterRegenerate(input: OverwriteAfterRegenerateInput): Promise<OverwriteAfterRegenerateResult> {
		const latest = await this.prisma.replyDraft.findFirst({
			where: { opportunityId: input.opportunityId },
			orderBy: { createdAt: 'desc' },
			select: { id: true, status: true }
		});

		if (!latest) {
			// No draft yet — fall back to create.
			await this.prisma.replyDraft.create({
				data: {
					opportunityId: input.opportunityId,
					originalBody: input.body,
					body: input.body,
					status: PrismaReplyDraftStatus.PENDING_APPROVAL,
					aiCallId: input.aiCallId
				}
			});
			return { overwrote: true };
		}

		if (latest.status === PrismaReplyDraftStatus.SENT) {
			return { overwrote: false };
		}

		await this.prisma.replyDraft.update({
			where: { id: latest.id },
			data: {
				originalBody: input.body,
				body: input.body,
				wasEditedByUser: false,
				status: PrismaReplyDraftStatus.PENDING_APPROVAL,
				aiCallId: input.aiCallId
			}
		});
		return { overwrote: true };
	}

	async findOrganizationName(organizationId: string): Promise<string | null> {
		const org = await this.prisma.organization.findUnique({
			where: { id: organizationId },
			select: { name: true }
		});
		return org?.name ?? null;
	}

	/**
	 * Persist the *first* draft for an opportunity. Idempotent: re-running the
	 * Inngest function on the same opportunity is a no-op if any draft row already
	 * exists for it (regardless of `status`).
	 * Idempotency is now an explicit "any draft exists?" check (was previously
	 * `@unique` on `opportunityId`, which the schema dropped to allow follow-up drafts).
	 * Use `createFollowup` instead when the second-or-later draft is intentional.
	 */
	async createIfAbsent(input: CreateReplyDraftInput): Promise<boolean> {
		const existing = await this.prisma.replyDraft.findFirst({
			where: { opportunityId: input.opportunityId },
			select: { id: true }
		});
		if (existing) {
			return false;
		}

		await this.prisma.replyDraft.create({
			data: {
				opportunityId: input.opportunityId,
				originalBody: input.body,
				body: input.body,
				status: PrismaReplyDraftStatus.PENDING_APPROVAL,
				aiCallId: input.aiCallId,
				kind: input.kind ?? PrismaReplyDraftKind.REPLY
			}
		});
		return true;
	}

	/**
	 * Persist a follow-up draft. Differs from `createIfAbsent`:
	 *  - No "exists" pre-check — the caller has already validated that the latest draft
	 *    is SENT (`composeFollowup` endpoint) or that this is the customer-driven path
	 *    (which always creates a new draft on thread reconstitution).
	 *  - Inserts unconditionally — the row will have a newer `createdAt` than prior
	 *    drafts, becoming the "current" draft for the opp.
	 * Callers should hold their own concurrency guard before this lands (e.g., the
	 * Inngest function's per-event retry budget + the controller's TenantWrite gate);
	 * we don't lock here because two follow-up drafts in flight is an exceedingly rare
	 * race the owner could resolve manually.
	 */
	async createFollowup(input: CreateReplyDraftInput): Promise<{ draftId: string }> {
		const row = await this.prisma.replyDraft.create({
			data: {
				opportunityId: input.opportunityId,
				originalBody: input.body,
				body: input.body,
				status: PrismaReplyDraftStatus.PENDING_APPROVAL,
				aiCallId: input.aiCallId,
				kind: input.kind ?? PrismaReplyDraftKind.REPLY
			},
			select: { id: true }
		});
		return { draftId: row.id };
	}

	/**
	 * Enumerate opportunities eligible for an auto check-in this scheduler tick.
	 * Eligibility:
	 *  - `status = REPLIED` (we sent something; customer hasn't replied on the thread —
	 *    a customer reply would have flipped status back to NEW via `attachFollowupMessage`)
	 *  - Not dismissed
	 *  - At least one ReplyDraft with `status = SENT`
	 *  - Latest ReplyDraft is SENT (no pending owner-facing draft already waiting on them
	 * we don't want to stack check-ins on top of unsent work)
	 *  - `(now − latestSentAt) ≥ org.followUpCadenceDays`
	 *  - Count of prior CHECK_IN drafts on the opp `< org.followUpMaxCount`
	 *  - Org's `followUpMaxCount > 0` (`0` disables the scheduler for the org)
	 *  - Org is entitled (trialing / active / past_due) — same set as `EntitlementGuard`
	 * Returned `lastSentAt` + `priorCheckInCount` are re-validated by the processor
	 * before generation so a race (owner sent a fresh draft between scheduler tick and
	 * processor run) can't produce a stale check-in.
	 * Uses raw SQL because the conditions span four joins + an aggregate; expressing
	 * this through Prisma's nested-where would require fetching too many rows client-
	 * side and counting in Node.
	 */
	async findCheckInCandidates(now: Date, batchSize: number): Promise<CheckInCandidate[]> {
		const rows = await this.prisma.$queryRaw<
			Array<{
				opportunityId: string;
				organizationId: string;
				cadenceDays: number;
				maxCount: number;
				lastSentAt: Date;
				priorCheckInCount: bigint;
			}>
		>(Prisma.sql`
			WITH latest_sent AS (
				SELECT
					rd."opportunityId" AS "opportunityId",
					MAX(rd."sentAt")    AS "lastSentAt",
					(
						SELECT rd2."id" FROM "ReplyDraft" rd2
						WHERE rd2."opportunityId" = rd."opportunityId"
						ORDER BY rd2."createdAt" DESC
						LIMIT 1
					)                    AS "latestDraftId",
					(
						SELECT rd3."status" FROM "ReplyDraft" rd3
						WHERE rd3."opportunityId" = rd."opportunityId"
						ORDER BY rd3."createdAt" DESC
						LIMIT 1
					)                    AS "latestDraftStatus",
					COUNT(*) FILTER (
						WHERE rd."kind" = ${PrismaReplyDraftKind.CHECK_IN}::"ReplyDraftKind"
					)                    AS "priorCheckInCount"
				FROM "ReplyDraft" rd
				WHERE rd."status" = ${PrismaReplyDraftStatus.SENT}::"ReplyDraftStatus"
				GROUP BY rd."opportunityId"
			)
			SELECT
				o."id"                              AS "opportunityId",
				o."organizationId"                  AS "organizationId",
				org."followUpCadenceDays"           AS "cadenceDays",
				org."followUpMaxCount"              AS "maxCount",
				ls."lastSentAt"                     AS "lastSentAt",
				ls."priorCheckInCount"              AS "priorCheckInCount"
			FROM "Opportunity" o
			JOIN "Organization" org ON org."id" = o."organizationId"
			JOIN latest_sent ls     ON ls."opportunityId" = o."id"
			LEFT JOIN "Subscription" sub ON sub."organizationId" = o."organizationId"
			WHERE o."status" = ${PrismaOpportunityStatus.REPLIED}::"OpportunityStatus"
			  AND o."dismissedAt" IS NULL
			  AND org."followUpMaxCount" > 0
			  AND org."followUpCadenceDays" >= 1
			  AND ls."latestDraftStatus" = ${PrismaReplyDraftStatus.SENT}::"ReplyDraftStatus"
			  AND ls."priorCheckInCount" < org."followUpMaxCount"
			  AND ${now} - ls."lastSentAt" >= make_interval(days => org."followUpCadenceDays")
			  AND (
				  sub."status" = ANY(${ENTITLED_STRIPE_STATUSES as string[]}::text[])
				  OR sub."status" IS NULL
			  )
			ORDER BY ls."lastSentAt" ASC
			LIMIT ${batchSize}
		`);
		return rows.map(r => ({
			opportunityId: r.opportunityId,
			organizationId: r.organizationId,
			cadenceDays: r.cadenceDays,
			maxCount: r.maxCount,
			lastSentAt: r.lastSentAt,
			priorCheckInCount: Number(r.priorCheckInCount)
		}));
	}

	/**
	 * Cheap defense-in-depth re-check before the processor calls the AI. Returns
	 * `null` if the opp is no longer eligible (status changed, draft was sent in the
	 * intervening seconds, owner started a draft, etc.). Caller treats null as "skip".
	 */
	async reValidateCheckInCandidate(opportunityId: string, now: Date): Promise<CheckInCandidate | null> {
		const [opp] = await this.prisma.$queryRaw<
			Array<{
				opportunityId: string;
				organizationId: string;
				cadenceDays: number;
				maxCount: number;
				oppStatus: PrismaOpportunityStatus;
				dismissedAt: Date | null;
				subStatus: string | null;
				lastSentAt: Date | null;
				latestDraftStatus: PrismaReplyDraftStatus | null;
				priorCheckInCount: bigint;
			}>
		>(Prisma.sql`
			SELECT
				o."id"                    AS "opportunityId",
				o."organizationId"        AS "organizationId",
				org."followUpCadenceDays" AS "cadenceDays",
				org."followUpMaxCount"    AS "maxCount",
				o."status"                AS "oppStatus",
				o."dismissedAt"           AS "dismissedAt",
				sub."status"              AS "subStatus",
				(
					SELECT MAX(rd."sentAt") FROM "ReplyDraft" rd
					WHERE rd."opportunityId" = o."id"
					  AND rd."status" = ${PrismaReplyDraftStatus.SENT}::"ReplyDraftStatus"
				) AS "lastSentAt",
				(
					SELECT rd2."status" FROM "ReplyDraft" rd2
					WHERE rd2."opportunityId" = o."id"
					ORDER BY rd2."createdAt" DESC
					LIMIT 1
				) AS "latestDraftStatus",
				(
					SELECT COUNT(*) FROM "ReplyDraft" rd3
					WHERE rd3."opportunityId" = o."id"
					  AND rd3."kind" = ${PrismaReplyDraftKind.CHECK_IN}::"ReplyDraftKind"
				) AS "priorCheckInCount"
			FROM "Opportunity" o
			JOIN "Organization" org ON org."id" = o."organizationId"
			LEFT JOIN "Subscription" sub ON sub."organizationId" = o."organizationId"
			WHERE o."id" = ${opportunityId}::uuid
		`);

		// Re-check entitlement at processor time. If a sub was canceled between the
		// scheduler tick and the processor run we must NOT spend an OpenAI call on it
		// the org has lost write entitlement everywhere else, the scheduler should
		// stand down in lockstep.
		const subEntitled = opp?.subStatus === null || ENTITLED_STRIPE_STATUSES.includes(opp?.subStatus ?? '');

		if (
			!opp ||
			opp.oppStatus !== PrismaOpportunityStatus.REPLIED ||
			opp.dismissedAt !== null ||
			opp.lastSentAt === null ||
			opp.latestDraftStatus !== PrismaReplyDraftStatus.SENT ||
			opp.maxCount === 0 ||
			opp.cadenceDays < 1 ||
			!subEntitled
		) {
			return null;
		}
		const priorCheckInCount = Number(opp.priorCheckInCount);
		if (priorCheckInCount >= opp.maxCount) {
			return null;
		}
		const cadenceMs = daysToMs(opp.cadenceDays);
		if (now.getTime() - opp.lastSentAt.getTime() < cadenceMs) {
			return null;
		}

		return {
			opportunityId: opp.opportunityId,
			organizationId: opp.organizationId,
			cadenceDays: opp.cadenceDays,
			maxCount: opp.maxCount,
			lastSentAt: opp.lastSentAt,
			priorCheckInCount
		};
	}

	/**
	 * Latest draft for an opportunity (1:N replacement for the prior unique
	 * lookup). Ordered by `createdAt DESC` so a freshly-inserted follow-up always
	 * surfaces ahead of older originals. Returns `null` when no draft has been
	 * generated yet (cold-start window between Opportunity insert and the Inngest
	 * draft-generate function finishing).
	 */
	async findByOpportunityId(opportunityId: string): Promise<ReplyDraftRecord | null> {
		return this.prisma.replyDraft.findFirst({
			where: { opportunityId },
			orderBy: { createdAt: 'desc' },
			include: REPLY_DRAFT_INCLUDE
		});
	}

	/**
	 * Returns true when the LATEST draft for the opp is `SENT`. Used by the
	 * "Concept-vervolg opstellen" endpoint to validate that a follow-up is appropriate
	 * (there's nothing newer that's still being drafted).
	 */
	async isLatestDraftSent(opportunityId: string): Promise<boolean> {
		const latest = await this.prisma.replyDraft.findFirst({
			where: { opportunityId },
			orderBy: { createdAt: 'desc' },
			select: { status: true }
		});
		return latest?.status === PrismaReplyDraftStatus.SENT;
	}

	/**
	 * Fetch everything the send orchestrator needs in one round-trip: the draft,
	 * the opportunity (for status + organizationId), the email account (for OAuth scope
	 * routing + From-address), the inbox owner's display name, the customer's contact
	 * + threading headers from the original RawMessage.
	 */
	async findSendContext(opportunityId: string): Promise<SendContext | null> {
		// Pick the LATEST draft regardless of status. The caller decides what to
		// do based on `context.status` (already-SENT → 409 alreadySent). Latest semantics
		// matter when a follow-up draft is pending: the SENT original is still on disk
		// but we want to operate on the new draft.
		const draft = await this.prisma.replyDraft.findFirst({
			where: { opportunityId },
			orderBy: { createdAt: 'desc' },
			select: {
				id: true,
				body: true,
				status: true,
				opportunity: {
					select: {
						id: true,
						organizationId: true,
						status: true,
						emailAccount: {
							select: {
								id: true,
								provider: true,
								email: true,
								userId: true,
								user: { select: { name: true } }
							}
						},
						rawMessage: {
							select: {
								subject: true,
								fromEmail: true,
								fromName: true,
								raw: true,
								threadId: true
							}
						},
						// Direct pointer to the newest customer-side message on the thread,
						// maintained by `attachThreadMessage` / `attachFollowupMessage`. The
						// send path uses its `raw` to source RFC 2822 threading headers.
						// `null` for fresh opps with no follow-up yet → caller falls back
						// to `rawMessage`. Faster than the old `threadMessages: take: 1`
						// subquery (no per-row sort), and the maintained pointer guarantees
						// it stays customer-side (the subquery would pick up own-org outbound).
						latestCustomerRawMessage: {
							select: { raw: true }
						}
					}
				},
				attachments: {
					orderBy: { createdAt: 'asc' },
					select: {
						id: true,
						filename: true,
						contentType: true,
						sizeBytes: true,
						storageKey: true
					}
				}
			}
		});

		if (!draft) {
			return null;
		}

		return {
			draftId: draft.id,
			body: draft.body,
			status: draft.status,
			opportunity: {
				id: draft.opportunity.id,
				organizationId: draft.opportunity.organizationId,
				status: draft.opportunity.status
			},
			emailAccount: {
				id: draft.opportunity.emailAccount.id,
				provider: draft.opportunity.emailAccount.provider,
				email: draft.opportunity.emailAccount.email,
				inboxOwnerUserId: draft.opportunity.emailAccount.userId,
				inboxOwnerName: draft.opportunity.emailAccount.user?.name ?? null
			},
			rawMessage: {
				subject: draft.opportunity.rawMessage.subject,
				fromEmail: draft.opportunity.rawMessage.fromEmail,
				fromName: draft.opportunity.rawMessage.fromName,
				raw: draft.opportunity.rawMessage.raw,
				threadId: draft.opportunity.rawMessage.threadId
			},
			latestThreadMessage: draft.opportunity.latestCustomerRawMessage
				? { raw: draft.opportunity.latestCustomerRawMessage.raw }
				: null,
			attachments: draft.attachments.map(a => ({
				id: a.id,
				filename: a.filename,
				contentType: a.contentType,
				sizeBytes: a.sizeBytes,
				storageKey: a.storageKey
			}))
		};
	}

	/**
	 * Mark the draft as `SENT` + the opportunity as `REPLIED` in one transaction.
	 * Wraps both because the customer-visible-effect (the email actually went out) is
	 * already irrevocable when this runs — leaving the DB half-updated would create the
	 * worst kind of split-brain (status says "still drafting" but the customer has the
	 * email). Either both transitions persist or neither does.
	 */
	/**
	 * Mark a *specific* draft as SENT. Takes `draftId` (not `opportunityId`)
	 * because an opp can have multiple drafts and the caller (`ReplyDraftsService.send`)
	 * has already resolved the right one via `findSendContext`.
	 * **:** Opp status transition is now CONDITIONAL. Skipped for terminal
	 * funnel states (`WON` / `LOST`) so a courtesy follow-up on a won deal doesn't
	 * silently flip it back to `REPLIED`. The customer-visible state of the deal stays
	 * what the owner said it was; only progression-relevant states get advanced to
	 * `REPLIED` to reflect "we just sent a reply on this active row."
	 */
	async markSent(input: { draftId: string; opportunityId: string }): Promise<MarkSentResult> {
		const now = new Date();

		const current = await this.prisma.opportunity.findUnique({
			where: { id: input.opportunityId },
			select: { status: true }
		});
		const shouldAdvanceOppStatus =
			current?.status !== undefined &&
			current.status !== 'WON' &&
			current.status !== 'LOST' &&
			current.status !== 'REPLIED';

		await this.prisma.$transaction([
			this.prisma.replyDraft.update({
				where: { id: input.draftId },
				data: { status: PrismaReplyDraftStatus.SENT, sentAt: now }
			}),
			...(shouldAdvanceOppStatus
				? [
						this.prisma.opportunity.update({
							where: { id: input.opportunityId },
							data: { status: 'REPLIED' }
						})
					]
				: [])
		]);
		return { draftSentAt: now };
	}
}

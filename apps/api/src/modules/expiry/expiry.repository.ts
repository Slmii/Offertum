import { Prisma } from '@/generated/prisma/client';
import {
	EmailProvider,
	ExpiryActionKind,
	ExpiryActionStatus,
	OpportunityStatus as PrismaOpportunityStatus
} from '@/generated/prisma/enums';
import { isOrganizationEntitled as isOrgEntitled } from '@/lib/billing/entitlement-check';
import { ENTITLED_STRIPE_STATUSES } from '@/modules/billing/billing.constants';
import { buildRawMessageAIInput } from '@/lib/email/raw-message-ai-input';
import { MS_PER_DAY } from '@/lib/time/duration';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

/**
 * A SENT quote drifting toward expiry without a customer reply. The expiry-watcher
 * cron (next task) turns each of these into an AI-suggested `ExpiryAction`.
 * `lastCustomerMessage` is the parsed body text of the opp's latest customer-side
 * message (via the maintained `latestCustomerRawMessage` pointer), fed to the AI so
 * the suggested copy reflects what the customer last said. `null` when no customer
 * message exists or the body couldn't be parsed.
 */
export interface ExpiryCandidate {
	organizationId: string;
	opportunityId: string;
	quoteDraftId: string;
	validUntil: Date;
	customerName: string | null;
	requestType: string;
	daysUntilExpiry: number;
	lastCustomerMessage: string | null;
}

/** The live (SUGGESTED) suggestion for an opp, or the authorization lookup result. */
export type ExpiryActionRecord = Prisma.ExpiryActionGetPayload<object>;

/** Cross-tenant authorization lookup result — minimal columns the guard + service need. */
export interface ExpiryActionForAuthorization {
	opportunityId: string;
	quoteDraftId: string;
}

/** Digest row — one per live suggestion in an org, with the days-left countdown. */
export interface ExpiringCallout {
	opportunityId: string;
	customerName: string | null;
	daysUntilExpiry: number;
}

// Row shape returned by the raw candidate scan before we parse the body JSON.
interface ExpiryCandidateRow {
	organizationId: string;
	opportunityId: string;
	quoteDraftId: string;
	validUntil: Date;
	customerName: string | null;
	requestType: string;
	lastMessageProvider: EmailProvider | null;
	lastMessageSubject: string | null;
	lastMessageFromName: string | null;
	lastMessageFromEmail: string | null;
	lastMessageRaw: Prisma.JsonValue | null;
}

/**
 * Compute whole-day count from now until a future deadline, rounding UP so an expiry
 * 25 hours out reads as "2 days" not "1" — never understate the runway to the owner.
 */
export function daysUntilExpiry(validUntil: Date, now: Date): number {
	return Math.ceil((validUntil.getTime() - now.getTime()) / MS_PER_DAY);
}

@Injectable()
export class ExpiryRepository {
	constructor(private readonly prisma: PrismaService) {}

	/**
	 * Single-org entitlement check for the expiry-card read. Delegates to the canonical
	 * strict predicate (`@/lib/billing/entitlement-check`) so W13 reads match the WRITE
	 * gate (`EntitlementGuard`) exactly: entitled ⇔ a Subscription row exists AND its
	 * status ∈ {trialing, active, past_due}. No-subscription / canceled = NOT entitled,
	 * so non-entitled orgs simply don't see the smart-expiry card.
	 */
	async isOrganizationEntitled(organizationId: string): Promise<boolean> {
		return isOrgEntitled(this.prisma, organizationId);
	}

	/**
	 * Enumerate SENT quotes drifting toward expiry that the owner hasn't heard back on.
	 * Four gates:
	 *  1. `validUntil` lands in `[now, now + windowDays]` (and the quote was actually sent).
	 *  2. The opportunity is live — not dismissed, not WON/LOST.
	 *  3. The customer hasn't replied since we sent: the maintained latest-customer
	 *     pointer is NULL, or its `internalDate` is at-or-before the quote's `sentAt`.
	 *  4. No `ExpiryAction` already exists for this `(quoteDraftId, validUntil)` — the
	 *     unique key prevents duplicates for the same window, so any existing row (in any
	 *     status) means we've already acted on this exact expiry; skip it. A later
	 *     EXTENDED `validUntil` yields a fresh window and re-qualifies naturally.
	 *  5. The org is entitled — same STRICT predicate as `EntitlementGuard` /
	 *     `isOrganizationEntitled` (a Subscription row exists AND status ∈
	 *     {trialing, active, past_due}). No-subscription / canceled = NOT entitled, so
	 *     those orgs never generate AI suggestions (real OpenAI spend).
	 * Raw SQL because the qualification spans a cross-table date comparison
	 * (`RawMessage.internalDate <= QuoteDraft.sentAt`) plus a NOT-EXISTS on a third table —
	 * expressing this through Prisma's nested-where would over-fetch and filter in Node,
	 * mirroring why `findCheckInCandidates` is raw. Ordered soonest-expiry first.
	 */
	async findExpiryCandidates(now: Date, windowDays = 5, cap = 500): Promise<ExpiryCandidate[]> {
		const rows = await this.prisma.$queryRaw<ExpiryCandidateRow[]>(Prisma.sql`
			SELECT
				qd."organizationId"   AS "organizationId",
				qd."opportunityId"    AS "opportunityId",
				qd."id"               AS "quoteDraftId",
				qd."validUntil"       AS "validUntil",
				o."customerName"      AS "customerName",
				o."requestType"       AS "requestType",
				rm_acc."provider"     AS "lastMessageProvider",
				rm."subject"          AS "lastMessageSubject",
				rm."fromName"         AS "lastMessageFromName",
				rm."fromEmail"        AS "lastMessageFromEmail",
				rm."raw"              AS "lastMessageRaw"
			FROM "QuoteDraft" qd
			JOIN "Opportunity" o ON o."id" = qd."opportunityId"
			JOIN "Subscription" s ON s."organizationId" = o."organizationId"
			LEFT JOIN "RawMessage" rm ON rm."id" = o."latestCustomerRawMessageId"
			LEFT JOIN "EmailAccount" rm_acc ON rm_acc."id" = rm."emailAccountId"
			WHERE qd."sentAt" IS NOT NULL
			  AND qd."validUntil" IS NOT NULL
			  AND qd."validUntil" >= ${now}
			  AND qd."validUntil" <= ${now} + make_interval(days => ${windowDays})
			  AND o."dismissedAt" IS NULL
			  AND o."status" NOT IN (
				  ${PrismaOpportunityStatus.WON}::"OpportunityStatus",
				  ${PrismaOpportunityStatus.LOST}::"OpportunityStatus"
			  )
			  AND s."status" = ANY(${ENTITLED_STRIPE_STATUSES as string[]}::text[])
			  AND (rm."internalDate" IS NULL OR rm."internalDate" <= qd."sentAt")
			  AND NOT EXISTS (
				  SELECT 1 FROM "ExpiryAction" ea
				  WHERE ea."quoteDraftId" = qd."id"
				    AND ea."validUntil" = qd."validUntil"
			  )
			ORDER BY qd."validUntil" ASC
			LIMIT ${cap}
		`);

		return rows.map(row => ({
			organizationId: row.organizationId,
			opportunityId: row.opportunityId,
			quoteDraftId: row.quoteDraftId,
			validUntil: row.validUntil,
			customerName: row.customerName,
			requestType: row.requestType,
			daysUntilExpiry: daysUntilExpiry(row.validUntil, now),
			lastCustomerMessage: this.extractLastCustomerMessage(row)
		}));
	}

	/**
	 * Persist a fresh suggestion. Idempotent: a P2002 unique violation on
	 * `(quoteDraftId, validUntil)` means a concurrent watcher run already inserted for
	 * this window — swallow it as a no-op rather than failing the cron tick.
	 */
	async insertSuggestion(input: {
		organizationId: string;
		opportunityId: string;
		quoteDraftId: string;
		validUntil: Date;
		recommendedAction: ExpiryActionKind;
		suggestedCopy: string;
		aiCallId: string | null;
	}): Promise<void> {
		try {
			await this.prisma.expiryAction.create({
				data: {
					organizationId: input.organizationId,
					opportunityId: input.opportunityId,
					quoteDraftId: input.quoteDraftId,
					validUntil: input.validUntil,
					recommendedAction: input.recommendedAction,
					suggestedCopy: input.suggestedCopy,
					aiCallId: input.aiCallId
				}
			});
		} catch (error) {
			if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
				return;
			}
			throw error;
		}
	}

	/**
	 * The most recent live (SUGGESTED) suggestion for an opportunity in this org, or `null`.
	 * Filters on the opportunity too: a suggestion on a deal the owner already resolved
	 * (WON/LOST) or dismissed must not render a card proposing MARK_LOST on a won deal.
	 */
	async findLiveForOpportunity(opportunityId: string, organizationId: string): Promise<ExpiryActionRecord | null> {
		return this.prisma.expiryAction.findFirst({
			where: {
				opportunityId,
				organizationId,
				status: ExpiryActionStatus.SUGGESTED,
				opportunity: {
					dismissedAt: null,
					status: { notIn: [PrismaOpportunityStatus.WON, PrismaOpportunityStatus.LOST] }
				}
			},
			orderBy: { createdAt: 'desc' }
		});
	}

	/**
	 * Single cross-tenant-safe lookup: returns the action only when it belongs to the
	 * given org, so the controller can authorize a take/dismiss without leaking rows
	 * across tenants. Mirrors `ReplyDraftAttachmentsRepository.findForAuthorization`.
	 */
	async findForAuthorization(id: string, organizationId: string): Promise<ExpiryActionForAuthorization | null> {
		const row = await this.prisma.expiryAction.findFirst({
			where: { id, organizationId },
			select: { opportunityId: true, quoteDraftId: true }
		});
		return row;
	}

	/**
	 * Race-narrowing claim: flip SUGGESTED → TAKEN only if the row is still SUGGESTED
	 * (CLAUDE.md #26). `count === 1` means this caller won the transition and may run the
	 * side-effect; `0` means a concurrent take/dismiss already resolved it.
	 */
	async claimAsTaken(id: string, takenAction: ExpiryActionKind, takenById: string): Promise<boolean> {
		const { count } = await this.prisma.expiryAction.updateMany({
			where: { id, status: ExpiryActionStatus.SUGGESTED },
			data: { status: ExpiryActionStatus.TAKEN, takenAction, takenById }
		});
		return count === 1;
	}

	/**
	 * Race-narrowing claim: flip SUGGESTED → DISMISSED only if still SUGGESTED. Returns
	 * `true` for the winner of the transition, `false` if already resolved.
	 */
	async claimAsDismissed(id: string): Promise<boolean> {
		const { count } = await this.prisma.expiryAction.updateMany({
			where: { id, status: ExpiryActionStatus.SUGGESTED },
			data: { status: ExpiryActionStatus.DISMISSED }
		});
		return count === 1;
	}

	/**
	 * Compensating revert for a failed side-effect after `claimAsTaken` won the
	 * transition: put the row back to SUGGESTED so the owner can retry. Conditional on
	 * `status = TAKEN` so a late/duplicate revert can never clobber a row that has since
	 * been resolved through another path.
	 */
	async revertTakenClaim(id: string): Promise<boolean> {
		const { count } = await this.prisma.expiryAction.updateMany({
			where: { id, status: ExpiryActionStatus.TAKEN },
			data: { status: ExpiryActionStatus.SUGGESTED, takenAction: null, takenById: null }
		});
		return count === 1;
	}

	/**
	 * Atomically bump a quote draft's validity to 14 days out. Anchors on
	 * `GREATEST("validUntil", NOW())` so an already-expired quote becomes valid 14 days
	 * from TODAY instead of e.g. 12 days from yesterday's stale date (Postgres GREATEST
	 * ignores NULLs, so a missing validUntil also anchors on NOW()). Single statement so
	 * even the race winner's update can't drift between a read and a write.
	 */
	async extendValidUntil(quoteDraftId: string): Promise<void> {
		await this.prisma.$executeRaw(Prisma.sql`
			UPDATE "QuoteDraft"
			SET "validUntil" = GREATEST("validUntil", NOW()) + INTERVAL '14 days'
			WHERE "id" = ${quoteDraftId}::uuid
		`);
	}

	/**
	 * Supersede all of an opportunity's live suggestions (optionally excluding one).
	 * Used when a newer suggestion replaces an older one for the same opp.
	 */
	async markSupersededForOpportunity(opportunityId: string, exceptId?: string): Promise<void> {
		await this.prisma.expiryAction.updateMany({
			where: {
				opportunityId,
				status: ExpiryActionStatus.SUGGESTED,
				...(exceptId ? { id: { not: exceptId } } : {})
			},
			data: { status: ExpiryActionStatus.SUPERSEDED }
		});
	}

	/**
	 * Live suggestions for an org, shaped for the digest's expiry callout. Filters out
	 * already-expired windows (`validUntil >= now` — a stale suggestion must never render
	 * "verloopt over -2 dagen" in a digest) and resolved/dismissed opportunities.
	 */
	async findExpiringCallouts(organizationId: string, now: Date): Promise<ExpiringCallout[]> {
		const rows = await this.prisma.expiryAction.findMany({
			where: {
				organizationId,
				status: ExpiryActionStatus.SUGGESTED,
				validUntil: { gte: now },
				opportunity: {
					dismissedAt: null,
					status: { notIn: [PrismaOpportunityStatus.WON, PrismaOpportunityStatus.LOST] }
				}
			},
			orderBy: { validUntil: 'asc' },
			select: {
				opportunityId: true,
				validUntil: true,
				opportunity: { select: { customerName: true } }
			}
		});
		return rows.map(row => ({
			opportunityId: row.opportunityId,
			customerName: row.opportunity.customerName,
			daysUntilExpiry: daysUntilExpiry(row.validUntil, now)
		}));
	}

	// Parse the latest customer message's body text out of its provider JSON. Returns
	// `null` when there's no customer message or the body couldn't be extracted.
	private extractLastCustomerMessage(row: ExpiryCandidateRow): string | null {
		if (row.lastMessageProvider === null || row.lastMessageRaw === null) {
			return null;
		}
		const bodyText = buildRawMessageAIInput({
			provider: row.lastMessageProvider,
			subject: row.lastMessageSubject,
			fromName: row.lastMessageFromName,
			fromEmail: row.lastMessageFromEmail,
			raw: row.lastMessageRaw
		}).bodyText;
		return bodyText.trim().length > 0 ? bodyText : null;
	}
}

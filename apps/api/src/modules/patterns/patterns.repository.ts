import { Prisma } from '@/generated/prisma/client';
import {
	OpportunityStatus as PrismaOpportunityStatus,
	ReplyDraftStatus as PrismaReplyDraftStatus
} from '@/generated/prisma/enums';
import { isOrganizationEntitled as isOrgEntitled } from '@/lib/billing/entitlement-check';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

import type { BucketStat } from './patterns.types';

@Injectable()
export class PatternsRepository {
	constructor(private readonly prisma: PrismaService) {}

	/**
	 * Single-org entitlement check for the dashboard read. Delegates to the canonical
	 * strict predicate (`@/lib/billing/entitlement-check`) so W13 reads match the WRITE
	 * gate (`EntitlementGuard`) exactly: entitled ⇔ a Subscription row exists AND its
	 * status ∈ {trialing, active, past_due}. No-subscription / canceled = NOT entitled,
	 * so non-entitled orgs simply don't see banners.
	 */
	async isOrganizationEntitled(organizationId: string): Promise<boolean> {
		return isOrgEntitled(this.prisma, organizationId);
	}

	// Denominator for the ≥10 visibility gate: non-dismissed opportunities for the org.
	async countOpportunities(organizationId: string): Promise<number> {
		return this.prisma.opportunity.count({
			where: { organizationId, dismissedAt: null }
		});
	}

	// The org's configured auto-follow-up cadence (days). Nullable in the schema —
	// caller treats `null` as "no cadence configured".
	async getFollowUpCadenceDays(organizationId: string): Promise<number | null> {
		const org = await this.prisma.organization.findUnique({
			where: { id: organizationId },
			select: { followUpCadenceDays: true }
		});
		return org?.followUpCadenceDays ?? null;
	}

	/**
	 * Average TRUE per-round customer reply latency (days).
	 *
	 * Over every CUSTOMER inbound message that has at least one of our SENT replies
	 * strictly before it on the same opportunity, compute
	 *   (customerMessage.internalDate − the most recent our-SENT-reply before it)
	 * in days, and return the AVG across all such qualifying messages — or null when none
	 * qualify.
	 *
	 * Definitions:
	 *  - "Our sent replies" = `ReplyDraft.sentAt` where `status = SENT`.
	 *  - "Customer inbound messages" = `RawMessage` rows on the opp's thread (either the
	 *    originating message via `Opportunity.rawMessageId`, or a follow-up linked via
	 *    `RawMessage.opportunityId`) whose lower-cased `fromEmail` is NOT one of the org's
	 *    own mailbox addresses (`EmailAccount.email`). This excludes our own outbound that
	 *    echoes back into a connected mailbox.
	 *
	 * This is genuine per-round latency: each customer message is paired with the MOST
	 * RECENT prior sent reply (correlated subquery), so multi-round threads no longer
	 * overstate the gap the way the old "first reply → latest customer message" proxy did.
	 *
	 * Scoped to non-dismissed opportunities. Raw, parameterized SQL — the per-message
	 * correlated MAX + the date arithmetic are cleaner in SQL than reducing in Node.
	 */
	async replySpeedStats(
		organizationId: string
	): Promise<{ avgCustomerReplyDays: number | null; sampleSize: number }> {
		const [row] = await this.prisma.$queryRaw<
			Array<{ avgDays: number | null; sampleCount: number | bigint }>
		>(Prisma.sql`
			WITH own_addresses AS (
				SELECT LOWER(ea."email") AS "email"
				FROM "EmailAccount" ea
				WHERE ea."organizationId" = ${organizationId}::uuid
			),
			customer_messages AS (
				SELECT DISTINCT o."id" AS "opportunityId", rm."internalDate" AS "internalDate"
				FROM "Opportunity" o
				JOIN "RawMessage" rm
					ON rm."id" = o."rawMessageId"
					OR rm."opportunityId" = o."id"
				WHERE o."organizationId" = ${organizationId}::uuid
				  AND o."dismissedAt" IS NULL
				  AND (
					  rm."fromEmail" IS NULL
					  OR LOWER(rm."fromEmail") NOT IN (SELECT "email" FROM own_addresses)
				  )
			),
			rounds AS (
				SELECT
					cm."internalDate" AS "customerAt",
					(
						SELECT MAX(rd."sentAt")
						FROM "ReplyDraft" rd
						WHERE rd."opportunityId" = cm."opportunityId"
						  AND rd."status" = ${PrismaReplyDraftStatus.SENT}::"ReplyDraftStatus"
						  AND rd."sentAt" IS NOT NULL
						  AND rd."sentAt" < cm."internalDate"
					) AS "priorSentAt"
				FROM customer_messages cm
			)
			SELECT
				AVG(
					EXTRACT(EPOCH FROM ("customerAt" - "priorSentAt")) / 86400.0
				) AS "avgDays",
				COUNT(*) AS "sampleCount"
			FROM rounds
			WHERE "priorSentAt" IS NOT NULL
		`);
		const avg = row?.avgDays;
		return {
			avgCustomerReplyDays: avg === null || avg === undefined ? null : Number(avg),
			sampleSize: row?.sampleCount === undefined ? 0 : Number(row.sampleCount)
		};
	}

	/**
	 * Win/loss tallies bucketed by first-response time, for the speed-wins insight.
	 *
	 * For each WON or LOST non-dismissed opp that has a SENT ReplyDraft, compute the
	 * first-response time in hours = (earliest SENT ReplyDraft.sentAt − opp.createdAt),
	 * then bucket:
	 *   fast   ≤ 4h
	 *   medium > 4h and ≤ 24h
	 *   slow   > 24h
	 * and count WON vs LOST in each bucket.
	 *
	 * Raw, parameterized SQL — single pass with conditional aggregation beats N round
	 * trips or large client-side reductions.
	 */
	async winRateByResponseBucket(
		organizationId: string
	): Promise<{ fast: BucketStat; medium: BucketStat; slow: BucketStat }> {
		const [row] = await this.prisma.$queryRaw<
			Array<{
				fastWon: bigint;
				fastLost: bigint;
				mediumWon: bigint;
				mediumLost: bigint;
				slowWon: bigint;
				slowLost: bigint;
			}>
		>(Prisma.sql`
			WITH first_sent AS (
				SELECT rd."opportunityId" AS "opportunityId", MIN(rd."sentAt") AS "firstSentAt"
				FROM "ReplyDraft" rd
				WHERE rd."status" = ${PrismaReplyDraftStatus.SENT}::"ReplyDraftStatus"
				  AND rd."sentAt" IS NOT NULL
				  -- Scope the aggregate to this org up front so it doesn't scan every org's
				  -- ReplyDrafts before the later Opportunity join narrows it (perf/index-friendly).
				  AND rd."opportunityId" IN (
					  SELECT "id" FROM "Opportunity" WHERE "organizationId" = ${organizationId}::uuid
				  )
				GROUP BY rd."opportunityId"
			),
			responses AS (
				SELECT
					o."status" AS "status",
					EXTRACT(EPOCH FROM (fs."firstSentAt" - o."createdAt")) / 3600.0 AS "hours"
				FROM "Opportunity" o
				JOIN first_sent fs ON fs."opportunityId" = o."id"
				WHERE o."organizationId" = ${organizationId}::uuid
				  AND o."dismissedAt" IS NULL
				  AND o."status" IN (
					${PrismaOpportunityStatus.WON}::"OpportunityStatus",
					${PrismaOpportunityStatus.LOST}::"OpportunityStatus"
				  )
			)
			SELECT
				COUNT(*) FILTER (WHERE "hours" <= 4 AND "status" = ${PrismaOpportunityStatus.WON}::"OpportunityStatus") AS "fastWon",
				COUNT(*) FILTER (WHERE "hours" <= 4 AND "status" = ${PrismaOpportunityStatus.LOST}::"OpportunityStatus") AS "fastLost",
				COUNT(*) FILTER (WHERE "hours" > 4 AND "hours" <= 24 AND "status" = ${PrismaOpportunityStatus.WON}::"OpportunityStatus") AS "mediumWon",
				COUNT(*) FILTER (WHERE "hours" > 4 AND "hours" <= 24 AND "status" = ${PrismaOpportunityStatus.LOST}::"OpportunityStatus") AS "mediumLost",
				COUNT(*) FILTER (WHERE "hours" > 24 AND "status" = ${PrismaOpportunityStatus.WON}::"OpportunityStatus") AS "slowWon",
				COUNT(*) FILTER (WHERE "hours" > 24 AND "status" = ${PrismaOpportunityStatus.LOST}::"OpportunityStatus") AS "slowLost"
			FROM responses
		`);
		return {
			fast: { wonCount: Number(row?.fastWon ?? 0), lostCount: Number(row?.fastLost ?? 0) },
			medium: { wonCount: Number(row?.mediumWon ?? 0), lostCount: Number(row?.mediumLost ?? 0) },
			slow: { wonCount: Number(row?.slowWon ?? 0), lostCount: Number(row?.slowLost ?? 0) }
		};
	}

	// patternKey → dismissedAt for this user+org.
	async findDismissals(organizationId: string, userId: string): Promise<Map<string, Date>> {
		const rows = await this.prisma.patternDismissal.findMany({
			where: { organizationId, userId },
			select: { patternKey: true, dismissedAt: true }
		});
		return new Map(rows.map(r => [r.patternKey, r.dismissedAt]));
	}

	// Upsert on the (organizationId, userId, patternKey) unique, refreshing dismissedAt.
	async upsertDismissal(organizationId: string, userId: string, patternKey: string, now: Date): Promise<void> {
		await this.prisma.patternDismissal.upsert({
			where: { organizationId_userId_patternKey: { organizationId, userId, patternKey } },
			create: { organizationId, userId, patternKey, dismissedAt: now },
			update: { dismissedAt: now }
		});
	}
}

import { Vertical } from '@/generated/prisma/enums';
import { MS_PER_HOUR } from '@/lib/time/duration';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import type { RankableOpportunity } from './ranking';
import { quoteNetEuros, type QuoteValueLine } from './quote-value';

@Injectable()
export class DigestRepository {
	constructor(private readonly prisma: PrismaService) {}

	// Returns orgs that are currently entitled to write — same set as `EntitlementGuard`
	// and the weekly digest (`NotificationsRepository.findEntitledOrganizationIds`):
	// subscription status ∈ {trialing, active, past_due} OR no subscription row. Selects
	// the extra columns the daily-digest ranking config needs (vertical for the win
	// baseline, follow-up cadence for time pressure).
	async findEntitledOrganizations(): Promise<{ id: string; vertical: Vertical; followUpCadenceDays: number }[]> {
		return this.prisma.$queryRaw<Array<{ id: string; vertical: Vertical; followUpCadenceDays: number }>>`
			SELECT o."id", o."vertical", o."followUpCadenceDays"
			FROM "Organization" o
			LEFT JOIN "Subscription" s ON s."organizationId" = o."id"
			WHERE s."status" IS NULL
			   OR s."status" IN ('trialing', 'active', 'past_due')
		`;
	}

	// Loads the open, non-dismissed opportunities for an org and maps each to the pure
	// ranking engine's `RankableOpportunity` shape. Open = NEW / WAITING / COLD / REPLIED
	// (everything that isn't WON/LOST).
	async findRankableOpportunities(organizationId: string): Promise<RankableOpportunity[]> {
		const opps = await this.prisma.opportunity.findMany({
			where: {
				organizationId,
				dismissedAt: null,
				status: { in: ['NEW', 'WAITING', 'COLD', 'REPLIED'] }
			},
			select: {
				id: true,
				customerName: true,
				requestType: true,
				customerDeadline: true,
				createdAt: true,
				// Count CHECK_IN drafts via a filtered relation count (no rows loaded).
				_count: {
					select: { replyDrafts: { where: { kind: 'CHECK_IN' } } }
				},
				// Latest quote draft drives the net value + validUntil.
				quoteDrafts: {
					orderBy: { createdAt: 'desc' },
					take: 1,
					select: {
						validUntil: true,
						lineItems: {
							select: {
								quantity: true,
								unitPriceEur: true,
								vatRate: true,
								vatReverseCharged: true
							}
						}
					}
				},
				// Earliest sent reply drives first-response time.
				replyDrafts: {
					where: { status: 'SENT' },
					orderBy: { sentAt: 'asc' },
					take: 1,
					select: { sentAt: true }
				}
			}
		});

		return opps.map(opp => {
			const latestQuote = opp.quoteDrafts[0] ?? null;
			// Prisma Decimals serialize to strings; the value helper expects exactly that.
			const lines = (latestQuote?.lineItems ?? []).map(
				(line): QuoteValueLine => ({
					quantity: line.quantity.toString(),
					unitPriceEur: line.unitPriceEur === null ? null : line.unitPriceEur.toString(),
					vatRate: line.vatRate,
					vatReverseCharged: line.vatReverseCharged
				})
			);

			const firstSentAt = opp.replyDrafts[0]?.sentAt ?? null;
			const firstResponseHours =
				firstSentAt === null ? null : (firstSentAt.getTime() - opp.createdAt.getTime()) / MS_PER_HOUR;

			return {
				opportunityId: opp.id,
				customerName: opp.customerName,
				requestType: opp.requestType,
				quoteNetEuros: latestQuote === null ? 0 : quoteNetEuros(lines),
				firstResponseHours,
				priorCheckInCount: opp._count.replyDrafts,
				validUntil: latestQuote?.validUntil ?? null,
				customerDeadline: opp.customerDeadline
			};
		});
	}

	// Win baseline input: how many closed deals the org has won vs. lost (non-dismissed).
	async countClosedOutcomes(organizationId: string): Promise<{ wonCount: number; lostCount: number }> {
		const [wonCount, lostCount] = await Promise.all([
			this.prisma.opportunity.count({
				where: { organizationId, dismissedAt: null, status: 'WON' }
			}),
			this.prisma.opportunity.count({
				where: { organizationId, dismissedAt: null, status: 'LOST' }
			})
		]);
		return { wonCount, lostCount };
	}

	async findExpiringCallouts(
		organizationId: string
	): Promise<{ customerName: string | null; daysUntilExpiry: number; opportunityUrl: string }[]> {
		// STUB — Phase C (smart expiry) wires the real ExpiryAction-backed query here.
		return [];
	}
}

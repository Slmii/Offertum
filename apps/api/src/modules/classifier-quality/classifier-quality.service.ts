import { Prisma } from '@/generated/prisma/client';
import { DismissReason as PrismaDismissReason } from '@/generated/prisma/enums';
import { resolveAdminRangeWindow } from '@/lib/time/admin-range-window';
import { OPPORTUNITY_DISMISS_REASON_TO_WIRE } from '@/modules/opportunities/opportunity-dismiss-reason.mapper';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import type {
	AIUsageRange,
	BulkMailFilterRecall,
	ClassifierDismissedRow,
	ClassifierPrecisionRow,
	ClassifierQualityResponse,
	ClassifierQualitySummary,
	DismissReasonCounts,
	OpportunityDismissReason as WireDismissReason
} from '@offertum/shared';

const RECENT_DISMISSALS_LIMIT = 5;
const UNKNOWN = 'unknown';

/**
 * Aggregations behind the admin classifier-quality dashboard.
 *
 * Three orthogonal metrics over the requested time window:
 *  - **precision** by `(organizationId, classifierProvider, classifierModel)` —
 *    `1 − (any-dismissal / total-in-bucket)`. Every dismiss reason counts: from the
 *    owner's perspective the system was wrong regardless of which subsystem failed.
 *    The per-reason breakdown is kept on each row so the dashboard can still show
 *    *which* subsystem (classifier / bulk-mail filter / dedup / other) is to blame.
 *    Classifier provider/model is pulled from `Opportunity.classifiedAiCall` (the FK)
 *    rather than `Opportunity.aiProvider` (which stores the extractor's SKU) so the
 *    metric is truthful when classifier and extractor diverge.
 *  - **recentDismissals** — five most-recently-dismissed rows in the window (any
 *    reason), with the `classifiedAiCallId` for cross-link to the AI Calls inspector.
 *  - **bulkMailFilter recall** — count of `Log` rows the bulk-mail filter wrote when it
 *    short-circuited (caught), versus count of opportunities the user later dismissed
 *    as SPAM (missed). SPAM-specific because that's the question this tile answers
 *    (filter quality vs. classifier quality at marketing emails). Counts are independent
 *    so the metric is well-defined even with one side at zero.
 *
 * Performance: a `findMany` + JS reduce is fine until the dashboard is opened against
 * millions of rows. When that day comes, swap to Prisma `groupBy` + SQL aggregates.
 */
@Injectable()
export class ClassifierQualityService {
	constructor(private readonly prisma: PrismaService) {}

	async aggregate(range: AIUsageRange): Promise<ClassifierQualityResponse> {
		const { rangeStart, rangeEnd } = resolveAdminRangeWindow(range);

		const [opportunities, recentDismissals, bulkMailFilter] = await Promise.all([
			this.fetchPrecisionRows(rangeStart, rangeEnd),
			this.fetchRecentDismissals(rangeStart, rangeEnd),
			this.fetchBulkMailFilterRecall(rangeStart, rangeEnd)
		]);

		const { precision, summary } = bucketPrecision(opportunities);

		return {
			range,
			rangeStart: rangeStart.toISOString(),
			rangeEnd: rangeEnd.toISOString(),
			summary,
			precision,
			recentDismissals,
			bulkMailFilter
		};
	}

	private async fetchPrecisionRows(rangeStart: Date, rangeEnd: Date) {
		// Window includes opportunities CREATED in range (the natural cohort) OR DISMISSED
		// in range (user feedback on older rows still pulls the bucket's precision down).
		// Without the OR-clause, a dismiss action on a backfilled / old opportunity would
		// silently fail to register on the dashboard until the range widened far enough to
		// include its `createdAt` — surprising in a feedback-loop UI where the user expects
		// their click to show up immediately. Prisma de-dups rows that match both legs.
		return this.prisma.opportunity.findMany({
			where: {
				OR: [
					{ createdAt: { gte: rangeStart, lt: rangeEnd } },
					{ dismissedAt: { gte: rangeStart, lt: rangeEnd } }
				]
			},
			select: {
				organizationId: true,
				dismissReason: true,
				classifiedAiCall: { select: { provider: true, model: true } }
			}
		});
	}

	private async fetchRecentDismissals(rangeStart: Date, rangeEnd: Date): Promise<ClassifierDismissedRow[]> {
		const rows = await this.prisma.opportunity.findMany({
			where: {
				dismissedAt: { gte: rangeStart, lt: rangeEnd }
			},
			orderBy: { dismissedAt: 'desc' },
			take: RECENT_DISMISSALS_LIMIT,
			select: {
				id: true,
				organizationId: true,
				classifiedAiCallId: true,
				dismissedAt: true,
				dismissedById: true,
				dismissReason: true,
				customerName: true,
				requestType: true,
				classifierConfidence: true,
				classifierReason: true,
				rawMessage: { select: { subject: true, fromEmail: true } },
				classifiedAiCall: { select: { provider: true, model: true } }
			}
		});

		return rows.map(row => ({
			opportunityId: row.id,
			organizationId: row.organizationId,
			classifiedAiCallId: row.classifiedAiCallId,
			classifierProvider: row.classifiedAiCall?.provider ?? null,
			classifierModel: row.classifiedAiCall?.model ?? null,
			// `dismissedAt` is non-null here by the where-clause, but Prisma's generated
			// type doesn't narrow on it — `.toISOString()` would crash without the guard.
			dismissedAt: row.dismissedAt?.toISOString() ?? new Date(0).toISOString(),
			dismissedByUserId: row.dismissedById,
			// Same narrowing reason as `dismissedAt` — non-null by the check-constraint
			// (`dismissReason IS NULL` iff `dismissedAt IS NULL`) + where-clause, but the
			// generated type leaves both nullable. Fall back to `other` to keep the type
			// strict; in practice this branch never fires.
			dismissReason: row.dismissReason
				? OPPORTUNITY_DISMISS_REASON_TO_WIRE[row.dismissReason]
				: ('other' as WireDismissReason),
			customerName: row.customerName,
			requestType: row.requestType,
			subject: row.rawMessage.subject,
			fromEmail: row.rawMessage.fromEmail,
			classifierConfidence: row.classifierConfidence,
			classifierReason: row.classifierReason
		}));
	}

	private async fetchBulkMailFilterRecall(rangeStart: Date, rangeEnd: Date): Promise<BulkMailFilterRecall> {
		const [caughtCount, missedCount] = await Promise.all([
			// `LogService.logAction({ action: 'opportunity.pipeline.bulk_mail_skipped', ... })`
			// stores the action in the `metadata` jsonb under the `action` key. We count
			// every row in range whose action matches — the count is the "caught" side
			// (true negatives the filter handled before the AI ever ran).
			this.prisma.log.count({
				where: {
					createdAt: { gte: rangeStart, lt: rangeEnd },
					metadata: {
						path: ['action'],
						equals: 'opportunity.pipeline.bulk_mail_skipped'
					} as Prisma.JsonFilter
				}
			}),
			this.prisma.opportunity.count({
				where: {
					dismissReason: PrismaDismissReason.SPAM,
					dismissedAt: { gte: rangeStart, lt: rangeEnd }
				}
			})
		]);

		const denominator = caughtCount + missedCount;
		const recall = denominator === 0 ? null : caughtCount / denominator;

		return { caughtCount, missedCount, recall };
	}
}

interface OpportunityPrecisionRow {
	organizationId: string;
	dismissReason: PrismaDismissReason | null;
	classifiedAiCall: { provider: string; model: string } | null;
}

function emptyReasonCounts(): DismissReasonCounts {
	return { not_a_quote: 0, duplicate: 0, spam: 0, other: 0 };
}

function bucketPrecision(opportunities: OpportunityPrecisionRow[]): {
	precision: ClassifierPrecisionRow[];
	summary: ClassifierQualitySummary;
} {
	const buckets = new Map<string, ClassifierPrecisionRow>();
	let totalOpportunities = 0;
	let totalDismissed = 0;
	const totalDismissedByReason = emptyReasonCounts();

	for (const opp of opportunities) {
		const provider = opp.classifiedAiCall?.provider ?? UNKNOWN;
		const model = opp.classifiedAiCall?.model ?? UNKNOWN;
		const key = `${opp.organizationId}|${provider}|${model}`;
		const isDismissed = opp.dismissReason !== null;
		const wireReason = opp.dismissReason ? OPPORTUNITY_DISMISS_REASON_TO_WIRE[opp.dismissReason] : null;

		let bucket = buckets.get(key);
		if (!bucket) {
			bucket = {
				organizationId: opp.organizationId,
				provider,
				model,
				totalOpportunities: 0,
				dismissedCount: 0,
				dismissedByReason: emptyReasonCounts(),
				// Filled in after the loop so the divisor is the final per-bucket total.
				precision: 0
			};
			buckets.set(key, bucket);
		}

		bucket.totalOpportunities += 1;
		if (isDismissed && wireReason) {
			bucket.dismissedCount += 1;
			bucket.dismissedByReason[wireReason] += 1;
		}

		totalOpportunities += 1;
		if (isDismissed && wireReason) {
			totalDismissed += 1;
			totalDismissedByReason[wireReason] += 1;
		}
	}

	const precision = Array.from(buckets.values())
		.map(row => ({ ...row, precision: 1 - row.dismissedCount / row.totalOpportunities }))
		// Lowest precision first — surfaces the buckets that need attention at the top.
		.sort((a, b) => a.precision - b.precision);

	const overallPrecision = totalOpportunities === 0 ? null : 1 - totalDismissed / totalOpportunities;

	return {
		precision,
		summary: { totalOpportunities, totalDismissed, totalDismissedByReason, overallPrecision }
	};
}

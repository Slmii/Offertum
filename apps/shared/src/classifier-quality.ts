import type { AIUsageRange } from './ai-usage.js';
import type { OpportunityDismissReason } from './opportunities.js';

/**
 * Wire-format types for `GET /api/admin/classifier-quality`. Admin-only (gated by the
 * same `ADMIN_EMAILS` allowlist that protects `/api/admin/ai-usage`); not shipped to
 * paying customers — when the Phase 5.5 owner dashboard (W14.10) needs the same numbers
 * per-org, it gets a separate narrower endpoint without the per-org slicing.
 *
 * Three orthogonal metrics over the chosen time window:
 *   - **precision** by (org, classifier model SKU) — `1 - (any dismissal / total)`. From
 *     the owner's perspective every dismiss means the system was wrong; the reason just
 *     diagnoses *which* subsystem to blame, so all four reasons feed precision.
 *   - **recentDismissals** — most-recent dismissed rows (any reason) with deep-link
 *     ammo (`classifiedAiCallId`) for the prompt/response inspector.
 *   - **bulkMailFilter recall proxy** — how often the bulk-mail pre-filter is missing
 *     marketing emails that the user then has to dismiss as SPAM. Still SPAM-specific
 *     because that's the question this tile answers (filter quality, not classifier).
 */

/** Per-reason dismissal counts. Keys mirror `OpportunityDismissReason`. */
export interface DismissReasonCounts {
	not_a_quote: number;
	duplicate: number;
	spam: number;
	other: number;
}

export interface ClassifierPrecisionRow {
	organizationId: string;
	/** Classifier provider (e.g. `openai`, `azure-openai`, or `unknown` if the AICall row is missing). */
	provider: string;
	/** Classifier model SKU (e.g. `gpt-4o-mini`, or `unknown`). */
	model: string;
	totalOpportunities: number;
	/** Sum across all reasons. */
	dismissedCount: number;
	dismissedByReason: DismissReasonCounts;
	/** `1 - (dismissedCount / totalOpportunities)`. Always defined when `totalOpportunities > 0`. */
	precision: number;
}

export interface ClassifierDismissedRow {
	opportunityId: string;
	organizationId: string;
	classifiedAiCallId: string | null;
	classifierProvider: string | null;
	classifierModel: string | null;
	dismissedAt: string;
	dismissedByUserId: string | null;
	dismissReason: OpportunityDismissReason;
	customerName: string | null;
	requestType: string;
	subject: string | null;
	fromEmail: string | null;
	classifierConfidence: number | null;
	classifierReason: string | null;
}

export interface BulkMailFilterRecall {
	/** Times the bulk-mail filter caught marketing email before the classifier ran. */
	caughtCount: number;
	/** Times the filter let marketing email through and the user dismissed it as SPAM. */
	missedCount: number;
	/**
	 * `caughtCount / (caughtCount + missedCount)`. Higher is better. `null` when both are
	 * zero so the UI can render "insufficient data" instead of NaN.
	 */
	recall: number | null;
}

export interface ClassifierQualitySummary {
	totalOpportunities: number;
	totalDismissed: number;
	totalDismissedByReason: DismissReasonCounts;
	/** Overall precision across every org + model. `null` when there are no opportunities. */
	overallPrecision: number | null;
}

export interface ClassifierQualityResponse {
	range: AIUsageRange;
	rangeStart: string;
	rangeEnd: string;
	summary: ClassifierQualitySummary;
	precision: ClassifierPrecisionRow[];
	recentDismissals: ClassifierDismissedRow[];
	bulkMailFilter: BulkMailFilterRecall;
}

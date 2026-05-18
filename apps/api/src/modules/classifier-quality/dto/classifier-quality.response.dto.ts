import type {
	AIUsageRange,
	BulkMailFilterRecall,
	ClassifierDismissedRow,
	ClassifierPrecisionRow,
	ClassifierQualityResponse,
	ClassifierQualitySummary,
	DismissReasonCounts,
	OpportunityDismissReason
} from '@quoteom/shared';

/**
 * Concrete DTO classes for `GET /api/admin/classifier-quality`. Required so the OpenAPI
 * spec — and therefore Orval-generated web types — carry the shape at runtime (interfaces
 * are erased and don't appear in the spec).
 */

export class DismissReasonCountsDto implements DismissReasonCounts {
	not_a_quote!: number;
	duplicate!: number;
	spam!: number;
	other!: number;
}

export class ClassifierPrecisionRowDto implements ClassifierPrecisionRow {
	organizationId!: string;
	provider!: string;
	model!: string;
	totalOpportunities!: number;
	dismissedCount!: number;
	dismissedByReason!: DismissReasonCountsDto;
	precision!: number;
}

export class ClassifierDismissedRowDto implements ClassifierDismissedRow {
	opportunityId!: string;
	organizationId!: string;
	classifiedAiCallId!: string | null;
	classifierProvider!: string | null;
	classifierModel!: string | null;
	dismissedAt!: string;
	dismissedByUserId!: string | null;
	dismissReason!: OpportunityDismissReason;
	customerName!: string | null;
	requestType!: string;
	subject!: string | null;
	fromEmail!: string | null;
	classifierConfidence!: number | null;
	classifierReason!: string | null;
}

export class BulkMailFilterRecallDto implements BulkMailFilterRecall {
	caughtCount!: number;
	missedCount!: number;
	recall!: number | null;
}

export class ClassifierQualitySummaryDto implements ClassifierQualitySummary {
	totalOpportunities!: number;
	totalDismissed!: number;
	totalDismissedByReason!: DismissReasonCountsDto;
	overallPrecision!: number | null;
}

export class ClassifierQualityResponseDto implements ClassifierQualityResponse {
	range!: AIUsageRange;
	rangeStart!: string;
	rangeEnd!: string;
	summary!: ClassifierQualitySummaryDto;
	precision!: ClassifierPrecisionRowDto[];
	recentDismissals!: ClassifierDismissedRowDto[];
	bulkMailFilter!: BulkMailFilterRecallDto;
}

import type { AIUsageResponse, AIUsageRow, AIUsageSummary } from '@/modules/ai-usage/ai-usage.service';
import type { AIUsageRange } from '@offertum/shared';

/**
 * DTOs for `GET /api/admin/ai-usage`. Concrete classes (not interfaces) so the OpenAPI
 * spec — and therefore Orval-generated web types — carry the shape at runtime.
 *
 * Currently this is dev-only (admin-email-gated), so the shape isn't 'shipped' to
 * production clients. If we later expose a per-org usage page to customers, that's a
 * different endpoint with a narrower DTO.
 */

export class AIUsageRowDto implements AIUsageRow {
	provider!: string;
	model!: string;
	purpose!: string;
	organizationId!: string | null;
	status!: string;
	callCount!: number;
	promptTokens!: number;
	completionTokens!: number;
	costUsd!: number;
	costIsEstimate!: boolean;
}

export class AIUsageSummaryDto implements AIUsageSummary {
	totalCalls!: number;
	totalPromptTokens!: number;
	totalCompletionTokens!: number;
	totalCostUsd!: number;
	unpricedModels!: string[];
}

export class AIUsageResponseDto implements AIUsageResponse {
	range!: AIUsageRange;
	rangeStart!: string;
	rangeEnd!: string;
	rows!: AIUsageRowDto[];
	summary!: AIUsageSummaryDto;
}

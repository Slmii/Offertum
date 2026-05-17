/**
 * Wire-format types for the dev/admin AI-usage dashboard at `GET /api/admin/ai-usage`.
 * Dev-only today (gated by ADMIN_EMAILS env allowlist), but the shapes mirror what we'd
 * later expose to customers if the base+usage pricing model wants a "my usage" page.
 */

export type AIUsageRange = 'today' | '7d' | '30d' | 'all';

export interface AIUsageRow {
	provider: string;
	model: string;
	purpose: string;
	organizationId: string | null;
	status: string;
	callCount: number;
	promptTokens: number;
	completionTokens: number;
	costUsd: number;
	costIsEstimate: boolean;
}

export interface AIUsageSummary {
	totalCalls: number;
	totalPromptTokens: number;
	totalCompletionTokens: number;
	totalCostUsd: number;
	unpricedModels: string[];
}

export interface AIUsageResponse {
	range: AIUsageRange;
	rangeStart: string;
	rangeEnd: string;
	rows: AIUsageRow[];
	summary: AIUsageSummary;
}

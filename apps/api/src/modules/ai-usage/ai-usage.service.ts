import { calculateCostUsd, rateFor } from '@/modules/ai-usage/pricing';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

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
	/** False when the model isn't in our pricing table — surfaced in the UI so we know to add it. */
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

/**
 * Aggregates `AICall` audit rows for the dev/admin dashboard. Groups by
 * (provider, model, purpose, organizationId, status) — the four dimensions the
 * dashboard slices by. Cost is computed in USD via `pricing.ts`.
 *
 * Performance: the `AICall` table is bounded (~hundreds of rows per org per day in the
 * MVP). A naïve `findMany` + JS reduce is fine until volume actually justifies SQL-side
 * aggregation. When that day comes, swap the `findMany` for a `groupBy` query.
 */
@Injectable()
export class AIUsageService {
	constructor(private readonly prisma: PrismaService) {}

	async aggregate(range: AIUsageRange): Promise<AIUsageResponse> {
		const { rangeStart, rangeEnd } = resolveWindow(range);

		const calls = await this.prisma.aICall.findMany({
			where: { createdAt: { gte: rangeStart, lt: rangeEnd } },
			select: {
				provider: true,
				model: true,
				purpose: true,
				organizationId: true,
				status: true,
				promptTokens: true,
				completionTokens: true
			}
		});

		const buckets = new Map<string, AIUsageRow>();
		const unpricedModels = new Set<string>();
		let totalCalls = 0;
		let totalPromptTokens = 0;
		let totalCompletionTokens = 0;
		let totalCostUsd = 0;

		for (const c of calls) {
			const key = `${c.provider}|${c.model}|${c.purpose}|${c.organizationId ?? '∅'}|${c.status}`;
			const promptTokens = c.promptTokens ?? 0;
			const completionTokens = c.completionTokens ?? 0;
			const costUsd = calculateCostUsd(c.model, promptTokens, completionTokens);
			const known = rateFor(c.model).known;
			if (!known) {
				unpricedModels.add(c.model);
			}

			const existing = buckets.get(key);
			if (existing) {
				existing.callCount += 1;
				existing.promptTokens += promptTokens;
				existing.completionTokens += completionTokens;
				existing.costUsd += costUsd;
				existing.costIsEstimate = existing.costIsEstimate || !known;
			} else {
				buckets.set(key, {
					provider: c.provider,
					model: c.model,
					purpose: c.purpose,
					organizationId: c.organizationId,
					status: c.status,
					callCount: 1,
					promptTokens,
					completionTokens,
					costUsd,
					costIsEstimate: !known
				});
			}

			totalCalls += 1;
			totalPromptTokens += promptTokens;
			totalCompletionTokens += completionTokens;
			totalCostUsd += costUsd;
		}

		const rows = Array.from(buckets.values()).sort((a, b) => b.costUsd - a.costUsd);

		return {
			range,
			rangeStart: rangeStart.toISOString(),
			rangeEnd: rangeEnd.toISOString(),
			rows,
			summary: {
				totalCalls,
				totalPromptTokens,
				totalCompletionTokens,
				totalCostUsd,
				unpricedModels: Array.from(unpricedModels)
			}
		};
	}
}

function resolveWindow(range: AIUsageRange): { rangeStart: Date; rangeEnd: Date } {
	const now = new Date();
	const rangeEnd = new Date(now);
	const rangeStart = new Date(now);

	switch (range) {
		case 'today':
			rangeStart.setUTCHours(0, 0, 0, 0);
			break;
		case '7d':
			rangeStart.setUTCDate(rangeStart.getUTCDate() - 7);
			break;
		case '30d':
			rangeStart.setUTCDate(rangeStart.getUTCDate() - 30);
			break;
		case 'all':
			// Far-past epoch — selects every row without a per-DB UNIX-zero quirk.
			rangeStart.setUTCFullYear(2000, 0, 1);
			rangeStart.setUTCHours(0, 0, 0, 0);
			break;
	}

	return { rangeStart, rangeEnd };
}

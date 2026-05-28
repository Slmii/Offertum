import { getAIUsageServer } from '@/lib/api/ai-usage.api';
import type { AIUsageRange } from '@offertum/shared';
import { queryOptions } from '@tanstack/react-query';

const AIUsageKeys = {
	all: ['admin', 'ai-usage'] as const,
	byRange: (range: AIUsageRange) => ['admin', 'ai-usage', range] as const
};

export const aiUsageQueryOptions = (range: AIUsageRange) =>
	queryOptions({
		queryKey: AIUsageKeys.byRange(range),
		queryFn: () => getAIUsageServer({ data: { range } }),
		staleTime: 60_000
	});

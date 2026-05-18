import { getClassifierQualityServer } from '@/lib/api/classifier-quality.api';
import type { AIUsageRange } from '@quoteom/shared';
import { queryOptions } from '@tanstack/react-query';

export const ClassifierQualityKeys = {
	all: ['admin', 'classifier-quality'] as const,
	byRange: (range: AIUsageRange) => ['admin', 'classifier-quality', range] as const
};

export const classifierQualityQueryOptions = (range: AIUsageRange) =>
	queryOptions({
		queryKey: ClassifierQualityKeys.byRange(range),
		queryFn: () => getClassifierQualityServer({ data: { range } }),
		staleTime: 60_000
	});

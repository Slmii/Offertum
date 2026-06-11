import { dismissPattern, getPatternsFn } from '@/lib/api/patterns.api';
import type { PatternKey } from '@offertum/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

export const PatternKeys = {
	all: ['patterns'] as const
};

/**
 * Loader-driven read for the dashboard pattern banners. `staleTime` matches the other
 * dashboard queries (myMembership, myOrganizations) — 30 s keeps the list fresh on a
 * normal navigation without hammering the endpoint on every render.
 */
export const patternsQueryOptions = queryOptions({
	queryKey: PatternKeys.all,
	queryFn: () => getPatternsFn(),
	staleTime: 30_000
});

/**
 * POST — dismiss a pattern banner for 30 days. Invalidates the patterns list so the
 * banner disappears immediately on success.
 */
export function useDismissPattern() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ key }: { key: PatternKey }) => dismissPattern({ key }),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: PatternKeys.all });
		}
	});
}

import { listOpportunitiesServer } from '@/lib/api/opportunities.api';
import { api } from '@/lib/api/client';
import type { Opportunity, OpportunityStatus } from '@quoteom/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

export const OpportunityKeys = {
	all: ['opportunities'] as const,
	list: (status: OpportunityStatus | null, search: string | null) =>
		['opportunities', 'list', { status, search: search?.trim() || null }] as const
};

/**
 * First page of opportunities for the active org. Status + search are part of the query
 * key, so each filter combination has its own cache entry and `Load more` mutations only
 * affect the page the user is viewing. `staleTime` is intentionally short — the user
 * expects brand-new emails to surface within seconds of arrival.
 */
export const opportunitiesListQueryOptions = (status: OpportunityStatus | null, search: string | null = null) =>
	queryOptions({
		queryKey: OpportunityKeys.list(status, search),
		queryFn: () => listOpportunitiesServer({ data: { status, search, limit: 25 } }),
		staleTime: 15_000
	});

/**
 * PATCH /api/opportunities/:id/status — inline status change from the list row. On
 * success we invalidate every opportunities cache (filtered + unfiltered) so the row
 * disappears/appears under the right tab without manual refresh.
 */
export function useUpdateOpportunityStatus() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, status }: { id: string; status: OpportunityStatus }) =>
			api<Opportunity>(`/api/opportunities/${id}/status`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ status })
			}),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: OpportunityKeys.all });
		}
	});
}

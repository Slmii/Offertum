import { dismissExpiryAction, getOpportunityExpiryActionFn, takeExpiryAction } from '@/lib/api/expiry.api';
import { OpportunityKeys } from '@/lib/queries/opportunities.queries';
import { QuoteDraftKeys } from '@/lib/queries/quote-drafts.queries';
import type { ExpiryActionKindValue } from '@offertum/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

export const ExpiryKeys = {
	all: ['expiry-action'] as const,
	forOpportunity: (opportunityId: string) => [...(['expiry-action'] as const), opportunityId] as const
};

/**
 * The live SUGGESTED expiry suggestion for an opportunity (or `null`). Short `staleTime`
 * to match the detail view's other fast-moving queries — the expiry watcher may write the
 * row shortly after the page loads. Loader-driven SSR per CLAUDE.md.
 */
export const opportunityExpiryActionQueryOptions = (opportunityId: string) =>
	queryOptions({
		queryKey: ExpiryKeys.forOpportunity(opportunityId),
		queryFn: () => getOpportunityExpiryActionFn({ data: { opportunityId } }),
		staleTime: 5_000
	});

/**
 * POST — take an expiry action. Invalidations cover every read the three actions can
 * change: the suggestion itself, the detail (status/draft), the QuotePanel's quote list
 * (EXTEND_14D moves `validUntil`), and the opportunity list + statusCounts (MARK_LOST
 * changes the funnel) — `OpportunityKeys.all` prefix-matches list, counts AND detail,
 * same as the sibling status-changing mutations.
 */
export function useTakeExpiryAction(opportunityId: string) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, kind }: { id: string; kind: ExpiryActionKindValue }) => takeExpiryAction({ id, kind }),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ExpiryKeys.forOpportunity(opportunityId) });
			void queryClient.invalidateQueries({ queryKey: OpportunityKeys.all });
			void queryClient.invalidateQueries({ queryKey: QuoteDraftKeys.list(opportunityId) });
		}
	});
}

/** POST — dismiss the suggestion; refresh both the suggestion + the detail. */
export function useDismissExpiryAction(opportunityId: string) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id }: { id: string }) => dismissExpiryAction({ id }),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ExpiryKeys.forOpportunity(opportunityId) });
			void queryClient.invalidateQueries({ queryKey: OpportunityKeys.detail(opportunityId) });
		}
	});
}

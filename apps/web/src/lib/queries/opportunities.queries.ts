import { getOpportunityDetailServer, listOpportunitiesServer } from '@/lib/api/opportunities.api';
import { api } from '@/lib/api/client';
import type {
	DismissOpportunityInput,
	Opportunity,
	OpportunityDetail,
	OpportunityDismissedFilter,
	OpportunityStatus,
	ReplyDraft,
	UpdateReplyDraftInput
} from '@quoteom/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

export const OpportunityKeys = {
	all: ['opportunities'] as const,
	list: (status: OpportunityStatus | null, search: string | null, dismissed: OpportunityDismissedFilter | null) =>
		[
			'opportunities',
			'list',
			{ status, search: search?.trim() || null, dismissed: dismissed ?? 'active' }
		] as const,
	detail: (id: string) => ['opportunities', 'detail', id] as const
};

/**
 * W5.4 — Detail view + draft editor. Short `staleTime` because the W5.3 Inngest
 * function may still be writing the `ReplyDraft` row when the user lands on the page;
 * we refetch frequently until it shows up. Loader-driven SSR per D16.
 */
export const opportunityDetailQueryOptions = (id: string) =>
	queryOptions({
		queryKey: OpportunityKeys.detail(id),
		queryFn: () => getOpportunityDetailServer({ data: { id } }),
		staleTime: 5_000
	});

/**
 * First page of opportunities for the active org. Status + search + dismissed are part
 * of the query key, so each filter combination has its own cache entry and `Load more`
 * mutations only affect the page the user is viewing. `staleTime` is intentionally
 * short — the user expects brand-new emails to surface within seconds of arrival.
 */
export const opportunitiesListQueryOptions = (
	status: OpportunityStatus | null,
	search: string | null = null,
	dismissed: OpportunityDismissedFilter | null = null
) =>
	queryOptions({
		queryKey: OpportunityKeys.list(status, search, dismissed),
		queryFn: () => listOpportunitiesServer({ data: { status, search, dismissed, limit: 25 } }),
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
				body: { status }
			}),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: OpportunityKeys.all });
		}
	});
}

/**
 * W4.6 — `PATCH /api/opportunities/:id/dismiss`. Invalidates every opportunities cache
 * so the dismissed row disappears from the default list and shows up under the
 * "Toon afgewezen" view in the same tick.
 */
export function useDismissOpportunity() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, reason, notes }: { id: string } & DismissOpportunityInput) =>
			api<Opportunity>(`/api/opportunities/${id}/dismiss`, {
				method: 'PATCH',
				body: { reason, notes }
			}),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: OpportunityKeys.all });
		}
	});
}

/**
 * W4.6 — `DELETE /api/opportunities/:id/dismiss`. Reverses a dismiss; the row returns
 * to the default list under whatever `status` it had before.
 */
export function useUndismissOpportunity() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id }: { id: string }) =>
			api<Opportunity>(`/api/opportunities/${id}/dismiss`, {
				method: 'DELETE'
			}),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: OpportunityKeys.all });
		}
	});
}

/**
 * W5.4 — `PATCH /api/opportunities/:id/reply-draft` autosave. Updates only the detail
 * cache (avoiding a full list refetch on every keystroke — the list response doesn't
 * carry the draft body so it doesn't need to change here). On success we splice the
 * returned `ReplyDraft` into the cached detail object so the editor stays in sync if
 * a parallel tab reads.
 */
export function useUpdateReplyDraft(opportunityId: string) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ body }: UpdateReplyDraftInput) =>
			api<ReplyDraft>(`/api/opportunities/${opportunityId}/reply-draft`, {
				method: 'PATCH',
				body: { body }
			}),
		onSuccess: nextDraft => {
			queryClient.setQueryData<OpportunityDetail | undefined>(OpportunityKeys.detail(opportunityId), current =>
				current ? { ...current, replyDraft: nextDraft } : current
			);
		}
	});
}

/**
 * W5.4 — `POST /api/opportunities/:id/reply-draft/regenerate`. "Regenereer in mijn
 * stijl" button. Uses the requesting user's `tonePlaybookText` (not the org OWNER's,
 * unlike the W5.3 first-generation event). Splices the new draft into the cached
 * detail so the editor immediately swaps to the freshly-regenerated body.
 */
export function useRegenerateReplyDraft(opportunityId: string) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: () =>
			api<ReplyDraft>(`/api/opportunities/${opportunityId}/reply-draft/regenerate`, {
				method: 'POST'
			}),
		onSuccess: nextDraft => {
			queryClient.setQueryData<OpportunityDetail | undefined>(OpportunityKeys.detail(opportunityId), current =>
				current ? { ...current, replyDraft: nextDraft } : current
			);
		}
	});
}

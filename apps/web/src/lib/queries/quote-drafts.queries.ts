import { api } from '@/lib/api/client';
import { listQuoteDraftsServer } from '@/lib/api/quote-drafts.api';
import type {
	CreateQuoteLineItemInput,
	ProposeQuoteLinesResponse,
	QuoteDraft,
	QuoteDraftListResponse,
	ReplaceQuoteLineInput,
	UpdateQuoteLineItemInput
} from '@offertum/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

export const QuoteDraftKeys = {
	all: ['quote-drafts'] as const,
	list: (opportunityId: string) => ['quote-drafts', 'list', opportunityId] as const
};

export const quoteDraftsQueryOptions = (opportunityId: string) =>
	queryOptions({
		queryKey: QuoteDraftKeys.list(opportunityId),
		queryFn: () => listQuoteDraftsServer({ data: { opportunityId } })
	});

/** POST — generate + persist a new draft for the opportunity. */
export function useGenerateQuoteDraft(opportunityId: string) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: () => api<QuoteDraft>(`/api/opportunities/${opportunityId}/quote-drafts`, { method: 'POST' }),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: QuoteDraftKeys.list(opportunityId) });
			// Timeline gains a "quote_created" event — refresh the opportunity detail too.
			void queryClient.invalidateQueries({ queryKey: ['opportunities', 'detail', opportunityId] });
		}
	});
}

/** POST — generate a fresh proposal WITHOUT persisting (powers the regenerate
 * compare modal). Returns the engine-priced lines for side-by-side review. */
export function useGenerateQuotePreview(opportunityId: string) {
	return useMutation({
		mutationFn: () =>
			api<ProposeQuoteLinesResponse>(`/api/opportunities/${opportunityId}/quote-line-items/preview`, {
				method: 'POST'
			})
	});
}

/** PUT — replace all lines on a draft with the owner's chosen merge set. */
export function useReplaceQuoteLines(opportunityId: string) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ quoteDraftId, lines }: { quoteDraftId: string; lines: ReplaceQuoteLineInput[] }) =>
			api<QuoteDraft>(`/api/quote-drafts/${quoteDraftId}/line-items`, { method: 'PUT', body: { lines } }),
		onSuccess: updated => patchDraftInList(queryClient, opportunityId, updated)
	});
}

/** POST — add an owner-authored line to a draft. */
export function useAddQuoteLineItem(opportunityId: string) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ quoteDraftId, input }: { quoteDraftId: string; input: CreateQuoteLineItemInput }) =>
			api<QuoteDraft>(`/api/quote-drafts/${quoteDraftId}/line-items`, { method: 'POST', body: input }),
		onSuccess: updated => patchDraftInList(queryClient, opportunityId, updated)
	});
}

/** PATCH — edit one line; response carries the recomputed draft. */
export function useUpdateQuoteLineItem(opportunityId: string) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({
			quoteDraftId,
			lineItemId,
			input
		}: {
			quoteDraftId: string;
			lineItemId: string;
			input: UpdateQuoteLineItemInput;
		}) =>
			api<QuoteDraft>(`/api/quote-drafts/${quoteDraftId}/line-items/${lineItemId}`, {
				method: 'PATCH',
				body: input
			}),
		onSuccess: updated => patchDraftInList(queryClient, opportunityId, updated)
	});
}

/** DELETE — remove a line; response carries the recomputed draft. */
export function useDeleteQuoteLineItem(opportunityId: string) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ quoteDraftId, lineItemId }: { quoteDraftId: string; lineItemId: string }) =>
			api<QuoteDraft>(`/api/quote-drafts/${quoteDraftId}/line-items/${lineItemId}`, { method: 'DELETE' }),
		onSuccess: updated => patchDraftInList(queryClient, opportunityId, updated)
	});
}

/** Splice an updated draft back into the cached list so the editor refreshes without a refetch. */
function patchDraftInList(
	queryClient: ReturnType<typeof useQueryClient>,
	opportunityId: string,
	updated: QuoteDraft
): void {
	queryClient.setQueryData<QuoteDraftListResponse | undefined>(QuoteDraftKeys.list(opportunityId), current =>
		current
			? { ...current, drafts: current.drafts.map(draft => (draft.id === updated.id ? updated : draft)) }
			: { drafts: [updated], pricingUpdatedAt: null }
	);
}

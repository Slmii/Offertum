import { api, WrapperApiError } from '@/lib/api/client';
import { getOpportunityDetailServer, listOpportunitiesServer } from '@/lib/api/opportunities.api';
import type {
	AssignOpportunityInput,
	DismissOpportunityInput,
	Opportunity,
	OpportunityAssigneeFilter,
	OpportunityDeadlineFilter,
	OpportunityDetail,
	OpportunityDismissedFilter,
	OpportunityMailboxOwnershipFilter,
	OpportunityStatus,
	OpportunityUrgency,
	ReplyDraft,
	ReplyDraftAttachment,
	UpdateOpportunityFieldsInput,
	UpdateReplyDraftInput
} from '@offertum/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

/** Attribute filters (has-replies / urgency / deadline / pending-follow-up / appointment). */
export interface OpportunityListAttributes {
	hasReplies?: boolean | null;
	urgency?: OpportunityUrgency | null;
	deadline?: OpportunityDeadlineFilter | null;
	pendingFollowup?: boolean | null;
	hasAppointment?: boolean | null;
}

// Normalize to a stable shape so the same filter state always produces the same query key.
const normalizeAttributes = (a: OpportunityListAttributes | null = null) => ({
	hasReplies: a?.hasReplies ?? false,
	urgency: a?.urgency ?? null,
	deadline: a?.deadline ?? 'all',
	pendingFollowup: a?.pendingFollowup ?? false,
	hasAppointment: a?.hasAppointment ?? false
});

export const OpportunityKeys = {
	all: ['opportunities'] as const,
	list: (
		status: OpportunityStatus | null,
		search: string | null,
		dismissed: OpportunityDismissedFilter | null,
		owner: OpportunityMailboxOwnershipFilter | null = null,
		assignee: OpportunityAssigneeFilter | null = null,
		attributes: OpportunityListAttributes | null = null
	) =>
		[
			'opportunities',
			'list',
			{
				status,
				search: search?.trim() || null,
				dismissed: dismissed ?? 'active',
				owner: owner ?? 'all',
				assignee: assignee ?? 'all',
				attributes: normalizeAttributes(attributes)
			}
		] as const,
	detail: (id: string) => ['opportunities', 'detail', id] as const
};

/**
 * Detail view + draft editor. Short `staleTime` because the Inngest
 * function may still be writing the `ReplyDraft` row when the user lands on the page;
 * we refetch frequently until it shows up. Loader-driven SSR per .
 */
export const opportunityDetailQueryOptions = (id: string) =>
	queryOptions({
		queryKey: OpportunityKeys.detail(id),
		queryFn: () => getOpportunityDetailServer({ data: { id } }),
		staleTime: 5_000,
		// Auto-poll while the initial reply draft is still being generated in the background
		// (Inngest), so it appears without a manual refresh. Stops once a draft exists or the
		// opp is dismissed (no draft is generated for dismissed opps).
		refetchInterval: query => {
			const detail = query.state.data;
			if (!detail) {
				// No data or error state — let TanStack Query's own retry handle recovery.
				return false;
			}
			const awaitingDraft = detail.replyDraft === null && detail.dismissedAt === null;
			return awaitingDraft ? 3_000 : false;
		}
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
	dismissed: OpportunityDismissedFilter | null = null,
	owner: OpportunityMailboxOwnershipFilter | null = null,
	assignee: OpportunityAssigneeFilter | null = null,
	attributes: OpportunityListAttributes | null = null
) =>
	queryOptions({
		queryKey: OpportunityKeys.list(status, search, dismissed, owner, assignee, attributes),
		queryFn: () =>
			listOpportunitiesServer({
				data: { status, search, dismissed, owner, assignee, ...normalizeAttributes(attributes), limit: 25 }
			}),
		staleTime: 15_000
	});

/**
 * PATCH /api/opportunities/:id/status — inline status change from the list row. On
 * success we invalidate every opportunities cache (filtered + unfiltered) so the row
 * disappears/appears under the right tab without manual refresh.
 */
/**
 * PATCH /api/opportunities/:id — partial-update the owner-editable extracted fields
 * (urgency / address / customerDeadline / customerAppointment). Splices the response
 * into the detail cache + invalidates the list cache so the list-row's deadline /
 * urgency badge picks up the change without a refetch round-trip.
 */
export function useUpdateOpportunityFields(opportunityId: string) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (input: UpdateOpportunityFieldsInput) =>
			api<Opportunity>(`/api/opportunities/${opportunityId}`, {
				method: 'PATCH',
				body: input
			}),
		onSuccess: updated => {
			queryClient.setQueryData<OpportunityDetail | undefined>(OpportunityKeys.detail(opportunityId), current =>
				current ? { ...current, ...updated } : current
			);
			void queryClient.invalidateQueries({ queryKey: OpportunityKeys.all });
		}
	});
}

/**
 * `PATCH /api/opportunities/:id/assignee` — set or clear the opportunity owner.
 * Splices the response into the detail cache + invalidates list caches so the
 * "Aan mij toegewezen" filter + the assignee badge update immediately.
 */
export function useAssignOpportunity(opportunityId: string) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (input: AssignOpportunityInput) =>
			api<Opportunity>(`/api/opportunities/${opportunityId}/assignee`, {
				method: 'PATCH',
				body: input
			}),
		onSuccess: updated => {
			queryClient.setQueryData<OpportunityDetail | undefined>(OpportunityKeys.detail(opportunityId), current =>
				current ? { ...current, ...updated } : current
			);
			void queryClient.invalidateQueries({ queryKey: OpportunityKeys.all });
		}
	});
}

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
 * `PATCH /api/opportunities/:id/dismiss`. Invalidates every opportunities cache
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
 * `DELETE /api/opportunities/:id/dismiss`. Reverses a dismiss; the row returns
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
 * `PATCH /api/opportunities/:id/reply-draft` autosave. Updates only the detail
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
 * `POST /api/opportunities/:id/reply-draft/regenerate`. "Regenereer in mijn
 * stijl" button. Uses the requesting user's `tonePlaybookText` (not the org OWNER's,
 * unlike the first-generation event). Splices the new draft into the cached
 * detail so the editor immediately swaps to the freshly-regenerated body.
 */
export function useRegenerateReplyDraft(opportunityId: string) {
	const queryClient = useQueryClient();

	return useMutation({
		meta: { billingMessage: 'om antwoorden te genereren' },
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

/**
 * `POST /api/opportunities/:id/reply-draft/send`. Sends the draft body as a
 * threaded reply via the connected inbox. On success, splices the SENT draft (with
 * `sentAt`) into the detail cache so the editor immediately renders the read-only
 * state. Also invalidates the list cache because `Opportunity.status` flips to
 * `replied` and the row should move under the right tab.
 */
/**
 *  follow-up — multipart upload for a reply-draft attachment. We don't go through
 * the JSON `api` wrapper because that always sets `Content-Type: application/json`;
 * for multipart the browser must set the header itself with the boundary. The error
 * shape mirrors `api` so callers can treat both paths the same.
 */
export function useUploadReplyDraftAttachment(opportunityId: string) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ file }: { file: File }) => {
			const formData = new FormData();
			formData.append('file', file);
			const response = await fetch(`/api/opportunities/${opportunityId}/reply-draft/attachments`, {
				method: 'POST',
				credentials: 'include',
				body: formData
			});
			if (!response.ok) {
				const errorBody = (await response.json().catch(() => null)) as {
					message?: string | string[];
					code?: string;
				} | null;
				const messageRaw = errorBody?.message;
				const message = Array.isArray(messageRaw)
					? messageRaw.join('; ')
					: typeof messageRaw === 'string'
						? messageRaw
						: response.statusText;
				throw new WrapperApiError({ code: response.status, message, apiCode: errorBody?.code });
			}
			return (await response.json()) as ReplyDraftAttachment;
		},
		onSuccess: nextAttachment => {
			queryClient.setQueryData<OpportunityDetail | undefined>(OpportunityKeys.detail(opportunityId), current => {
				if (!current?.replyDraft) {
					return current;
				}
				return {
					...current,
					replyDraft: {
						...current.replyDraft,
						attachments: [...current.replyDraft.attachments, nextAttachment]
					}
				};
			});
		}
	});
}

/**
 *  follow-up — remove an attachment. Optimistically removes the chip from the
 * detail cache so the UI feels instant; failures rollback by invalidating the detail
 * query so the server's authoritative list lands.
 */
export function useDeleteReplyDraftAttachment(opportunityId: string) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ attachmentId }: { attachmentId: string }) => {
			await api<void>(`/api/opportunities/${opportunityId}/reply-draft/attachments/${attachmentId}`, {
				method: 'DELETE'
			});
			return { attachmentId };
		},
		onSuccess: ({ attachmentId }) => {
			queryClient.setQueryData<OpportunityDetail | undefined>(OpportunityKeys.detail(opportunityId), current => {
				if (!current?.replyDraft) {
					return current;
				}
				return {
					...current,
					replyDraft: {
						...current.replyDraft,
						attachments: current.replyDraft.attachments.filter(a => a.id !== attachmentId)
					}
				};
			});
		},
		onError: () => {
			void queryClient.invalidateQueries({ queryKey: OpportunityKeys.detail(opportunityId) });
		}
	});
}

export function useSendReplyDraft(opportunityId: string) {
	const queryClient = useQueryClient();

	return useMutation({
		meta: { billingMessage: 'om antwoorden te versturen' },
		mutationFn: () =>
			api<ReplyDraft>(`/api/opportunities/${opportunityId}/reply-draft/send`, {
				method: 'POST'
			}),
		onSuccess: nextDraft => {
			// opp.status is NO LONGER unconditionally flipped to 'replied'
			// on send (WON/LOST stay put). Drop the optimistic status update; the
			// invalidate below re-fetches the authoritative status from the server.
			// Also mirror the API mapper rule: once a draft is SENT, it appears in
			// `replyDraftHistory` alongside staying as the current `replyDraft`. The
			// cache splice avoids a brief flash where the history panel still shows
			// "0 versions" between the optimistic update and the refetch landing.
			queryClient.setQueryData<OpportunityDetail | undefined>(OpportunityKeys.detail(opportunityId), current => {
				if (!current) {
					return current;
				}
				const wasAlreadyInHistory = current.replyDraftHistory.some(d => d.id === nextDraft.id);
				return {
					...current,
					replyDraft: nextDraft,
					replyDraftHistory: wasAlreadyInHistory
						? current.replyDraftHistory.map(d => (d.id === nextDraft.id ? nextDraft : d))
						: [nextDraft, ...current.replyDraftHistory]
				};
			});
			void queryClient.invalidateQueries({ queryKey: OpportunityKeys.all });
		}
	});
}

/**
 * `POST /api/opportunities/:id/reply-draft/followup`. Powers the "Concept-vervolg
 * opstellen" button on a SENT draft. Server creates a NEW `ReplyDraft` row (the prior
 * SENT one stays put as an immutable record of what the customer received) and flips
 * opp.status back to `new` so the editability rule unlocks the editor for the freshly-
 * generated draft. We splice the new draft into the detail cache + invalidate the list
 * cache so the row jumps under the `Nieuw` tab.
 * Cache update: when the new draft becomes "current," the previously-current draft
 * (almost always a SENT one) is prepended to the history array. Keeps the UI in sync
 * with the server's authoritative ordering without a re-fetch.
 */
export function useComposeFollowupReplyDraft(opportunityId: string) {
	const queryClient = useQueryClient();

	return useMutation({
		meta: { billingMessage: 'om een vervolgbericht op te stellen' },
		mutationFn: () =>
			api<ReplyDraft>(`/api/opportunities/${opportunityId}/reply-draft/followup`, {
				method: 'POST'
			}),
		onSuccess: nextDraft => {
			// compose-followup no longer flips opp.status; the deal stays
			// where the owner left it. Splice the new draft in. The prior `replyDraft`
			// (which must have been SENT to enable compose-followup) is ALREADY in
			// `replyDraftHistory` thanks to the API mapper's "include sent latest in
			// history" rule — don't prepend again or we'd render a duplicate accordion.
			queryClient.setQueryData<OpportunityDetail | undefined>(OpportunityKeys.detail(opportunityId), current => {
				if (!current) {
					return current;
				}
				const priorDraft = current.replyDraft;
				const priorAlreadyInHistory =
					priorDraft !== null && current.replyDraftHistory.some(d => d.id === priorDraft.id);
				const nextHistory =
					priorDraft && !priorAlreadyInHistory
						? [priorDraft, ...current.replyDraftHistory]
						: current.replyDraftHistory;
				return { ...current, replyDraft: nextDraft, replyDraftHistory: nextHistory };
			});
			void queryClient.invalidateQueries({ queryKey: OpportunityKeys.all });
		}
	});
}

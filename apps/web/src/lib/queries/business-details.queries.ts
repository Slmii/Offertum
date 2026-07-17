import { api, apiForm, postForm } from '@/lib/api/client';
import { getBusinessDetailsServer } from '@/lib/api/business-details.api';
import type { BusinessDetails, PurgeIngestedDataResult, UpdateBusinessDetailsInput } from '@offertum/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

const BusinessDetailsKeys = {
	all: ['me', 'business-details'] as const
};

export const businessDetailsQueryOptions = queryOptions({
	queryKey: BusinessDetailsKeys.all,
	queryFn: () => getBusinessDetailsServer(),
	staleTime: 15_000
});

export function useUpdateBusinessDetails() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: UpdateBusinessDetailsInput) =>
			api<BusinessDetails>('/api/me/business-details', { method: 'PATCH', body: input }),
		onSuccess: data => {
			queryClient.setQueryData(BusinessDetailsKeys.all, data);
		}
	});
}

export function useUploadBusinessAsset(kind: 'logo' | 'letterhead') {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (file: File) => {
			const formData = new FormData();
			formData.append('file', file);
			return apiForm<BusinessDetails>(`/api/me/business-details/${kind}`, formData, { method: 'POST' });
		},
		onSuccess: data => {
			queryClient.setQueryData(BusinessDetailsKeys.all, data);
		}
	});
}

export function useDeleteBusinessAsset(kind: 'logo' | 'letterhead') {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => api<BusinessDetails>(`/api/me/business-details/${kind}`, { method: 'DELETE' }),
		onSuccess: data => {
			queryClient.setQueryData(BusinessDetailsKeys.all, data);
		}
	});
}

export function useDeleteOrganization() {
	return useMutation({
		mutationFn: async (confirm: string) => {
			await api<void>('/api/me/organization', { method: 'DELETE', body: { confirm } });
			// The org is gone and the user's currentOrganizationId is now a fallback org or
			// null — clear the Auth.js session so they're fully logged out instead of stranded
			// in a broken / wrong-org state. Auth.js's signout is a CSRF-protected form POST.
			// Best-effort: the org is ALREADY deleted, so a signout hiccup must not reject the
			// mutation and strand the user on this page — the hard redirect below runs regardless.
			try {
				const { csrfToken } = await api<{ csrfToken: string }>('/api/auth/csrf');
				await postForm('/api/auth/signout', { csrfToken });
			} catch {
				// Ignore — falls through to the redirect, which leaves the (now-orgless) app.
			}
		},
		// Full reload to sign-in wipes the SPA query cache + any in-memory session/router state.
		onSuccess: () => {
			window.location.href = '/sign-in';
		}
	});
}

export function usePurgeOrganizationData() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => api<PurgeIngestedDataResult>('/api/me/organization/data', { method: 'DELETE' }),
		// The purge wipes opportunities, drafts, quotes, and notifications across the whole
		// app — invalidate everything so no stale list lingers after it runs.
		onSuccess: () => queryClient.invalidateQueries()
	});
}

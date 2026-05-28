import { api, apiForm } from '@/lib/api/client';
import { getBusinessDetailsServer } from '@/lib/api/business-details.api';
import type { BusinessDetails, UpdateBusinessDetailsInput } from '@offertum/shared';
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
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (confirm: string) => api<void>('/api/me/organization', { method: 'DELETE', body: { confirm } }),
		onSuccess: () => {
			queryClient.clear();
			window.location.href = '/sign-in';
		}
	});
}

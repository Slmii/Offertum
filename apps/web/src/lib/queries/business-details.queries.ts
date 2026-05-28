import { api } from '@/lib/api/client';
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

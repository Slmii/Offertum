import { api } from '@/lib/api/client';
import { listCatalogItemsServer } from '@/lib/api/catalog-items.api';
import type { CatalogItem, CatalogItemList, CreateCatalogItemInput, UpdateCatalogItemInput } from '@quoteom/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

export const CatalogItemsKeys = {
	all: ['catalog-items'] as const
};

export const catalogItemsQueryOptions = queryOptions({
	queryKey: CatalogItemsKeys.all,
	queryFn: () => listCatalogItemsServer(),
	staleTime: 15_000
});

export function useCreateCatalogItem() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: CreateCatalogItemInput) =>
			api<CatalogItem>('/api/catalog-items', { method: 'POST', body: input }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: CatalogItemsKeys.all });
		}
	});
}

export function useUpdateCatalogItem() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, patch }: { id: string; patch: UpdateCatalogItemInput }) =>
			api<CatalogItem>(`/api/catalog-items/${id}`, { method: 'PATCH', body: patch }),
		onSuccess: updated => {
			queryClient.setQueryData<CatalogItemList>(CatalogItemsKeys.all, prev => {
				if (!prev) {
					return prev;
				}
				return { items: prev.items.map(item => (item.id === updated.id ? updated : item)) };
			});
		}
	});
}

export function useDeleteCatalogItem() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => api<void>(`/api/catalog-items/${id}`, { method: 'DELETE' }),
		onSuccess: (_, id) => {
			queryClient.setQueryData<CatalogItemList>(CatalogItemsKeys.all, prev => {
				if (!prev) {
					return prev;
				}
				return { items: prev.items.filter(item => item.id !== id) };
			});
		}
	});
}

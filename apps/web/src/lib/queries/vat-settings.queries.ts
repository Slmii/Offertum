import { api } from '@/lib/api/client';
import { getVatSettingsServer } from '@/lib/api/vat-settings.api';
import type { OrgVatConfig } from '@offertum/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

const VatSettingsKeys = {
	all: ['me', 'vat-settings'] as const
};

/**
 * Loader-driven read of the org VAT config. Consumed by the business-details settings page AND
 * the quote/catalog VAT selects (both prefetch this in their loaders), so it has a single key.
 */
export const vatSettingsQueryOptions = queryOptions({
	queryKey: VatSettingsKeys.all,
	queryFn: () => getVatSettingsServer(),
	staleTime: 60_000,
	// The settings section mirrors this into local state and re-seeds on every data change; a
	// window-focus refetch mid-edit would clobber in-progress (pre-blur) changes. Settings rarely
	// change out from under the editor, so skip the focus refetch.
	refetchOnWindowFocus: false
});

/** `PATCH /api/me/vat-settings` — owner-only. */
export function useUpdateVatSettings() {
	const queryClient = useQueryClient();

	return useMutation({
		// Serialize saves: the section persists a full-config snapshot on every row action, so
		// without a shared scope two rapid edits could resolve out of order and the older response
		// would overwrite the newer one in the cache. A scope id runs them one at a time, in order.
		scope: { id: 'vat-settings' },
		mutationFn: (input: OrgVatConfig) =>
			api<OrgVatConfig>('/api/me/vat-settings', { method: 'PATCH', body: input }),
		onSuccess: data => {
			queryClient.setQueryData(VatSettingsKeys.all, data);
		}
	});
}

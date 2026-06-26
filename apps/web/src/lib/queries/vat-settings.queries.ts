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
	staleTime: 60_000
});

/** `PATCH /api/me/vat-settings` — owner-only. */
export function useUpdateVatSettings() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (input: OrgVatConfig) =>
			api<OrgVatConfig>('/api/me/vat-settings', { method: 'PATCH', body: input }),
		onSuccess: data => {
			queryClient.setQueryData(VatSettingsKeys.all, data);
		}
	});
}

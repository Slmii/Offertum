import { serverFetch } from '@/lib/api/server-fetch';
import type { OrgVatConfig } from '@offertum/shared';
import { createServerFn } from '@tanstack/react-start';

/**
 * GET /api/me/vat-settings — read the active org's VAT configuration (allowed rates, default
 * rate, reverse-charge availability + label). Used by the quote/catalog route loaders and the
 * business-details settings page. Members can read; only OWNER can mutate (PATCH sits behind
 * `OwnerGuard`).
 */
export const getVatSettingsServer = createServerFn({ method: 'GET' })
	.inputValidator((data: void) => data)
	.handler(async (): Promise<OrgVatConfig> => {
		const response = await serverFetch('/api/me/vat-settings');
		if (!response.ok) {
			throw new Error(`Failed to load VAT settings (${response.status})`);
		}
		return (await response.json()) as OrgVatConfig;
	});

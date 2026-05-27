import { serverFetch } from '@/lib/api/server-fetch';
import type { BusinessDetails } from '@offertum/shared';
import { createServerFn } from '@tanstack/react-start';

/**
 * GET /api/me/business-details — read the active org's customer-facing details
 * (legal name, KvK/VAT, address, footer, default payment terms). Members can read;
 * the PATCH route is owner-locked.
 */
export const getBusinessDetailsServer = createServerFn({ method: 'GET' })
	.inputValidator((data: void) => data)
	.handler(async (): Promise<BusinessDetails> => {
		const response = await serverFetch('/api/me/business-details');
		if (!response.ok) {
			throw new Error(`Failed to load business details (${response.status})`);
		}
		return (await response.json()) as BusinessDetails;
	});

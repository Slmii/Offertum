import { serverFetch } from '@/lib/api/server-fetch';
import type { QuoteDraftListResponse } from '@offertum/shared';
import { createServerFn } from '@tanstack/react-start';

/**
 * Isomorphic GET /api/opportunities/:id/quote-drafts — same code path SSR + client
 * via `createServerFn`, so the route loader can prefetch the persisted drafts.
 */
export const listQuoteDraftsServer = createServerFn({ method: 'GET' })
	.inputValidator((data: { opportunityId: string }) => data)
	.handler(async ({ data }): Promise<QuoteDraftListResponse> => {
		const response = await serverFetch(`/api/opportunities/${encodeURIComponent(data.opportunityId)}/quote-drafts`);
		if (!response.ok) {
			throw new Error(`Failed to load quote drafts (${response.status})`);
		}
		return (await response.json()) as QuoteDraftListResponse;
	});

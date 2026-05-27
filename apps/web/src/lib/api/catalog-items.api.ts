import { serverFetch } from '@/lib/api/server-fetch';
import type { CatalogItemList } from '@quoteom/shared';
import { createServerFn } from '@tanstack/react-start';

/**
 * GET /api/catalog-items — owner-only on the API; route guard already bounces
 * non-owners before the loader runs. Returns active + inactive items so the
 * settings page can render the full list with a "deactivated" badge instead of
 * making rows disappear on disable.
 */
export const listCatalogItemsServer = createServerFn({ method: 'GET' })
	.inputValidator((data: void) => data)
	.handler(async (): Promise<CatalogItemList> => {
		const response = await serverFetch('/api/catalog-items');
		if (!response.ok) {
			throw new Error(`Failed to load catalog items (${response.status})`);
		}
		return (await response.json()) as CatalogItemList;
	});

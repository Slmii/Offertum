import { serverFetch } from '@/lib/api/server-fetch';
import type { FollowUpSettings } from '@quoteom/shared';
import { createServerFn } from '@tanstack/react-start';

/**
 * GET /api/me/follow-up-settings — read the active org's cadence + cap (W6.2).
 * Used by the `/settings/follow-ups` route loader. Members can read; only OWNER
 * can mutate (the PATCH endpoint sits behind `@UseGuards(OwnerGuard)`).
 */
export const getFollowUpSettingsServer = createServerFn({ method: 'GET' })
	.inputValidator((data: void) => data)
	.handler(async (): Promise<FollowUpSettings> => {
		const response = await serverFetch('/api/me/follow-up-settings');
		if (!response.ok) {
			throw new Error(`Failed to load follow-up settings (${response.status})`);
		}
		return (await response.json()) as FollowUpSettings;
	});

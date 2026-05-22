import { serverFetch } from '@/lib/api/server-fetch';
import type { TonePlaybook } from '@quoteom/shared';
import { createServerFn } from '@tanstack/react-start';

/**
 * GET /api/me/tone-playbook — read the current user's writing-style playbook.
 * Used by the `/settings/writing-style` settings page loader.
 */
export const getTonePlaybookServer = createServerFn({ method: 'GET' })
	.inputValidator((data: void) => data)
	.handler(async (): Promise<TonePlaybook> => {
		const response = await serverFetch('/api/me/tone-playbook');
		if (!response.ok) {
			throw new Error(`Failed to load tone playbook (${response.status})`);
		}
		return (await response.json()) as TonePlaybook;
	});

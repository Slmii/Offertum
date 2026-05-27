import { serverFetch } from '@/lib/api/server-fetch';
import type { AIUsageRange, ClassifierQualityResponse } from '@offertum/shared';
import { createServerFn } from '@tanstack/react-start';

/**
 * GET /api/admin/classifier-quality?range=... — admin classifier-quality dashboard
 * data. Admin-allowlist gated on the API side (see `AdminEmailGuard`); the parent
 * `(app)/admin/route.tsx` layout duplicates the gate on the FE so non-admins never
 * even reach this fetch.
 */
export const getClassifierQualityServer = createServerFn({ method: 'GET' })
	.inputValidator((data: { range: AIUsageRange }) => data)
	.handler(async ({ data }): Promise<ClassifierQualityResponse> => {
		const response = await serverFetch(`/api/admin/classifier-quality?range=${encodeURIComponent(data.range)}`);
		if (!response.ok) {
			throw new Error(`Failed to load classifier quality (${response.status})`);
		}
		return (await response.json()) as ClassifierQualityResponse;
	});

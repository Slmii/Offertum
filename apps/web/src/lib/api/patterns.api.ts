import { api } from '@/lib/api/client';
import { serverFetch } from '@/lib/api/server-fetch';
import type { PatternBanner, PatternKey } from '@offertum/shared';
import { createServerFn } from '@tanstack/react-start';

/**
 * Isomorphic GET /api/patterns — returns 0–2 pattern banners to surface on the dashboard.
 * The server already applies the ≥10-opportunity gate + 30-day dismissal window, so an
 * empty array is the normal "nothing to show" response.
 */
export const getPatternsFn = createServerFn({ method: 'GET' }).handler(async (): Promise<PatternBanner[]> => {
	const response = await serverFetch('/api/patterns');

	if (!response.ok) {
		throw new Error(`Failed to load patterns (${response.status})`);
	}

	return response.json() as Promise<PatternBanner[]>;
});

/** POST — 30-day server-side dismissal for a pattern banner (204, no body). */
export function dismissPattern({ key }: { key: PatternKey }): Promise<void> {
	return api<void>(`/api/patterns/${key}/dismiss`, { method: 'POST' });
}

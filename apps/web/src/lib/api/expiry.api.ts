import { api } from '@/lib/api/client';
import { serverFetch } from '@/lib/api/server-fetch';
import type { ExpiryActionKindValue, ExpiryActionResponse } from '@offertum/shared';
import { createServerFn } from '@tanstack/react-start';

/**
 * Isomorphic GET /api/opportunities/:id/expiry-action — same code path SSR + client via
 * `createServerFn`, so the detail route loader can prefetch the live suggestion. The
 * endpoint returns the live SUGGESTED row or a JSON `null` body when there's nothing to
 * surface; we read the body as text first so an empty/`null` body collapses cleanly to
 * `null` instead of throwing on `response.json()`.
 */
export const getOpportunityExpiryActionFn = createServerFn({ method: 'GET' })
	.inputValidator((data: { opportunityId: string }) => data)
	.handler(async ({ data }): Promise<ExpiryActionResponse | null> => {
		const response = await serverFetch(
			`/api/opportunities/${encodeURIComponent(data.opportunityId)}/expiry-action`
		);
		if (!response.ok) {
			throw new Error(`Failed to load expiry action (${response.status})`);
		}
		const text = await response.text();
		if (!text) {
			return null;
		}
		return JSON.parse(text) as ExpiryActionResponse | null;
	});

/** POST — carry out one of the three expiry actions, marking the suggestion TAKEN (204). */
export function takeExpiryAction({ id, kind }: { id: string; kind: ExpiryActionKindValue }): Promise<void> {
	return api<void>(`/api/expiry-actions/${id}/take`, { method: 'POST', body: { kind } });
}

/** POST — dismiss an expiry suggestion without acting on it (204). */
export function dismissExpiryAction({ id }: { id: string }): Promise<void> {
	return api<void>(`/api/expiry-actions/${id}/dismiss`, { method: 'POST' });
}

import { serverFetch } from '@/lib/api/server-fetch';
import type { PricingPlaybook, PricingRule } from '@quoteom/shared';
import { createServerFn } from '@tanstack/react-start';

interface PricingRulesResponse {
	rules: PricingRule[];
}

/**
 * Isomorphic GET /api/pricing-playbook — same code path SSR + client via
 * `createServerFn`. The endpoint lazy-creates the row, so callers always get
 * a usable `{ playbookText: '', compiledAt: null, ... }` shape for fresh orgs.
 */
export const getPricingPlaybookServer = createServerFn({ method: 'GET' }).handler(
	async (): Promise<PricingPlaybook> => {
		const response = await serverFetch('/api/pricing-playbook');
		if (!response.ok) {
			throw new Error(`Failed to load pricing playbook (${response.status})`);
		}
		return (await response.json()) as PricingPlaybook;
	}
);

export const listPricingRulesServer = createServerFn({ method: 'GET' }).handler(
	async (): Promise<PricingRulesResponse> => {
		const response = await serverFetch('/api/pricing-playbook/rules');
		if (!response.ok) {
			throw new Error(`Failed to load pricing rules (${response.status})`);
		}
		return (await response.json()) as PricingRulesResponse;
	}
);

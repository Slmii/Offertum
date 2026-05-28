import { api } from '@/lib/api/client';
import { getPricingPlaybookServer, listPricingRulesServer } from '@/lib/api/pricing-playbook.api';
import type { PricingPlaybook, PricingRule, UpdatePricingPlaybookInput } from '@offertum/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

const PricingPlaybookKeys = {
	all: ['pricing-playbook'] as const,
	root: ['pricing-playbook', 'root'] as const,
	rules: ['pricing-playbook', 'rules'] as const
};

/**
 * Settings page primary query. `staleTime` is short because the compile pass
 * mutates `compiledAt` + `rulesCount` asynchronously after a save — refetch on
 * focus picks up the new state without polling.
 */
export const pricingPlaybookQueryOptions = queryOptions({
	queryKey: PricingPlaybookKeys.root,
	queryFn: getPricingPlaybookServer,
	staleTime: 5_000
});

/**
 * PUT /api/pricing-playbook — save the prose. Splices the response into the cache
 * so the page reflects the new `updatedAt` instantly; the compile pass updates
 * `compiledAt` + `rulesCount` on a subsequent refetch.
 */
export function useUpdatePricingPlaybook() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: UpdatePricingPlaybookInput) =>
			api<PricingPlaybook>('/api/pricing-playbook', {
				method: 'PUT',
				body: input
			}),
		onSuccess: updated => {
			queryClient.setQueryData(PricingPlaybookKeys.root, updated);
			// Compile fires asynchronously — invalidate rules so the next focus picks
			// up the new set as soon as the compile completes.
			void queryClient.invalidateQueries({ queryKey: PricingPlaybookKeys.rules });
		}
	});
}

/**
 * GET /api/pricing-playbook/rules — full rule list (active + inactive). Used by
 * the review-card list under the editor. Short staleTime so the compile pass's
 * result lands quickly after a save.
 */
export const pricingRulesQueryOptions = queryOptions({
	queryKey: PricingPlaybookKeys.rules,
	queryFn: listPricingRulesServer,
	staleTime: 5_000
});

interface UpdateRulePatch {
	id: string;
	condition?: Record<string, unknown>;
	effect?: Record<string, unknown>;
	priority?: number;
	active?: boolean;
	description?: string;
	conditionNarrative?: string | null;
}

/**
 * PATCH /api/pricing-playbook/rules/:id — flips manualOverride=true server-side.
 * Invalidate the rules cache + the root cache (rule count + manual-override
 * status both visible there).
 */
export function useUpdatePricingRule() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, ...patch }: UpdateRulePatch) =>
			api<PricingRule>(`/api/pricing-playbook/rules/${id}`, {
				method: 'PATCH',
				body: patch
			}),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: PricingPlaybookKeys.all });
		}
	});
}

export function useDeletePricingRule() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => api<void>(`/api/pricing-playbook/rules/${id}`, { method: 'DELETE' }),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: PricingPlaybookKeys.all });
		}
	});
}

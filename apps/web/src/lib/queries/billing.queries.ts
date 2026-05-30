import { getBillingStatusServer } from '@/lib/api/billing.api';
import { api } from '@/lib/api/client';
import type { BillingSyncResponse, CheckoutSessionResponse, PortalSessionResponse } from '@offertum/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

export const BillingKeys = {
	status: ['billing', 'status'] as const
};

/**
 * GET /api/billing/status — single code path for SSR + client via `createServerFn`.
 * Use with `loader: ({ context }) => context.queryClient.ensureQueryData(billingStatusQueryOptions)`
 * and read in the component via `useSuspenseQuery(billingStatusQueryOptions)`.
 */
export const billingStatusQueryOptions = queryOptions({
	queryKey: BillingKeys.status,
	queryFn: getBillingStatusServer,
	staleTime: 30_000
});

/** Hit POST /api/billing/checkout-session, then redirect the browser to Stripe Checkout. */
export function useStartCheckout() {
	// No local state to invalidate — redirects to Stripe Checkout via window.location.
	return useMutation({
		mutationFn: async () => {
			const { url } = await api<CheckoutSessionResponse>('/api/billing/checkout-session', {
				method: 'POST'
			});
			window.location.href = url;
		}
	});
}

/** Hit POST /api/billing/portal-session, then redirect the browser to the Customer Portal. */
export function useOpenPortal() {
	// No local state to invalidate — redirects to Stripe Customer Portal via window.location.
	return useMutation({
		mutationFn: async () => {
			const { url } = await api<PortalSessionResponse>('/api/billing/portal-session', {
				method: 'POST'
			});
			window.location.href = url;
		}
	});
}

/**
 * POST /api/billing/end-trial — "Upgrade to paid now". Ends the Stripe trial immediately
 * (charges the saved card, flips trialing → active) so the org can grow past the trial seat
 * cap. Invalidates the status query so the page reflects the new state + seat math.
 */
export function useEndTrial() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: () => api<BillingSyncResponse>('/api/billing/end-trial', { method: 'POST' }),
		onSettled: () => queryClient.invalidateQueries({ queryKey: BillingKeys.status })
	});
}

/** Force a re-sync of subscription state from Stripe. Called from /billing/success. */
export function useSyncBilling() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: () => {
			return api<BillingSyncResponse>('/api/billing/sync', {
				method: 'POST'
			});
		},
		onSettled: () => queryClient.invalidateQueries({ queryKey: BillingKeys.status })
	});
}

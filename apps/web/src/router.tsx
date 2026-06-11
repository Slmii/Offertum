import { BILLING_REQUIRED_CODE, WrapperApiError } from '@/lib/api/client';
import { billingNoticeStore } from '@/lib/billing-notice.store';
import { routeTree } from '@/routeTree.gen';
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query';

const BILLING_GENERIC_MESSAGE = 'Een abonnement is nodig om deze actie uit te voeren.';

/**
 * Global error handler for `QueryCache`. When the API returns the structured
 * `billing_required` 402, push the notice into the global store so the
 * (app)-layout banner can surface it. Any caller-level `onError` still runs
 * after this — the global handler doesn't swallow the error, it just observes.
 */
function handleQueryError(error: unknown): void {
	if (!(error instanceof WrapperApiError)) {
		return;
	}
	if (error.apiCode !== BILLING_REQUIRED_CODE) {
		return;
	}
	billingNoticeStore.show({
		message: BILLING_GENERIC_MESSAGE,
		billingPath: error.billingPath ?? '/billing'
	});
}

export function getRouter() {
	const queryClient = new QueryClient({
		queryCache: new QueryCache({ onError: handleQueryError }),
		mutationCache: new MutationCache({
			/**
			 * Mutation-aware 402 handler. Reads `mutation.meta.billingMessage`
			 * (a short Dutch action phrase, e.g. `om antwoorden te versturen`) and
			 * composes the banner copy as `Een abonnement is nodig ${billingMessage}.`
			 * when the tagged meta is present; falls back to the friendly generic copy
			 * otherwise. Never shows the raw server-error string.
			 *
			 * TanStack Query v5 MutationCache.onError signature:
			 *   (error, variables, onMutateResult, mutation, context)
			 */
			onError(error, _variables, _onMutateResult, mutation) {
				if (!(error instanceof WrapperApiError)) {
					return;
				}
				if (error.apiCode !== BILLING_REQUIRED_CODE) {
					return;
				}
				const billingMessage = mutation.meta?.billingMessage;
				const message =
					typeof billingMessage === 'string'
						? `Een abonnement is nodig ${billingMessage}.`
						: BILLING_GENERIC_MESSAGE;
				billingNoticeStore.show({
					message,
					billingPath: error.billingPath ?? '/billing'
				});
			}
		})
	});

	const router = createTanStackRouter({
		routeTree,
		context: { queryClient },
		defaultPreload: 'intent',
		defaultNotFoundComponent: () => <>Not Found</>,
		scrollRestoration: true
	});

	setupRouterSsrQueryIntegration({
		router,
		queryClient
	});

	return router;
}

declare module '@tanstack/react-router' {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}

declare module '@tanstack/react-query' {
	interface Register {
		mutationMeta: {
			/**
			 * Short Dutch action phrase used to compose the `BillingRequiredBanner`
			 * copy when a mutation hits a 402 `billing_required` response.
			 * E.g. `'om antwoorden te versturen'` renders as
			 * `'Een abonnement is nodig om antwoorden te versturen.'`
			 */
			billingMessage?: string;
		};
	}
}

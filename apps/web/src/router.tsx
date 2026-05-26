import { BILLING_REQUIRED_CODE, WrapperApiError } from '@/lib/api/client';
import { billingNoticeStore } from '@/lib/billing-notice.store';
import { routeTree } from '@/routeTree.gen';
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query';

/**
 * Global error handler attached to both `MutationCache` and `QueryCache`. When
 * the API returns the structured `billing_required` 402, push the notice into
 * the global store so the (app)-layout banner can surface it. Any caller-level
 * `onError` still runs after this — the global handler doesn't swallow the
 * error, it just observes.
 */
function handleApiError(error: unknown): void {
	if (!(error instanceof WrapperApiError)) {return;}
	if (error.apiCode !== BILLING_REQUIRED_CODE) {return;}
	billingNoticeStore.show({
		message:
			error.message ||
			'Je organisatie heeft geen actief abonnement. Sluit een abonnement af om wijzigingen op te slaan.',
		billingPath: error.billingPath ?? '/billing'
	});
}

export function getRouter() {
	const queryClient = new QueryClient({
		queryCache: new QueryCache({ onError: handleApiError }),
		mutationCache: new MutationCache({ onError: handleApiError })
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

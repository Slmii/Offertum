import { BillingRequiredBanner } from '@/components/BillingRequiredBanner.component';
import { NotificationBell } from '@/components/NotificationBell.component';
import { SilentErrorBoundary } from '@/components/SilentErrorBoundary.component';
import { notificationsListQueryOptions } from '@/lib/queries/notifications.queries';
import { myOrganizationsQueryOptions } from '@/lib/queries/team.queries';
import Box from '@mui/material/Box';
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { Suspense } from 'react';

const NO_ORGANIZATION_PATH = '/no-organization';

export const Route = createFileRoute('/(app)')({
	beforeLoad: async ({ context, location }) => {
		if (!context.session) {
			throw redirect({ to: '/sign-in' });
		}

		// Skip the org-presence check when the destination IS `/no-organization`. Otherwise
		// the redirect below would loop forever on that route.
		if (location.pathname === NO_ORGANIZATION_PATH) {
			return;
		}

		// A signed-in user whose `currentOrganizationId` is null (e.g. they were the last
		// removed member of their only org) would otherwise hit a 403 on every
		// `/api/me/membership`-shaped route in the app. Front-run that error with a friendly
		// empty-state page.
		//
		// `ensureQueryData` (not `fetchQuery`) so the loaded data is reused by the
		// `/no-organization` route's own loader without a second round-trip.
		const organizations = await context.queryClient.ensureQueryData(myOrganizationsQueryOptions);
		if (organizations.length === 0) {
			throw redirect({ to: NO_ORGANIZATION_PATH });
		}
	},
	// Prefetch the notification list so the bell renders with data on first paint
	// instead of suspending the entire app shell. The layout component itself mounts
	// once per session; the loader only runs on initial entry to any (app)/* route.
	// Errors here are intentionally swallowed — notifications are non-essential, so a
	// 500 on `/api/me/notifications` must NOT take down the entire (app)/* route tree.
	// The bell's own ErrorBoundary handles the render-time re-throw from useSuspenseQuery.
	loader: async ({ context }) => {
		try {
			await context.queryClient.ensureQueryData(notificationsListQueryOptions);
		} catch {
			// Bell falls back to "no notifications" via the SilentErrorBoundary below.
		}
	},
	component: RouteComponent
});

function RouteComponent() {
	return (
		<>
			<BillingRequiredBanner />
			<Box
				sx={{
					position: 'sticky',
					top: 0,
					zIndex: 10,
					backgroundColor: 'background.default',
					borderBottom: 1,
					borderBottomColor: 'divider',
					display: 'flex',
					justifyContent: 'flex-end',
					alignItems: 'center',
					px: 2,
					py: 0.5
				}}
			>
				<SilentErrorBoundary>
					<Suspense fallback={null}>
						<NotificationBell />
					</Suspense>
				</SilentErrorBoundary>
			</Box>
			<Outlet />
		</>
	);
}

import { AppShell } from '@/components/AppShell.component';
import { BillingRequiredBanner } from '@/components/BillingRequiredBanner.component';
import { DevRoleToggle } from '@/components/DevRoleToggle.component';
import { billingStatusQueryOptions } from '@/lib/queries/billing.queries';
import { notificationsListQueryOptions } from '@/lib/queries/notifications.queries';
import { myMembershipQueryOptions, myOrganizationsQueryOptions } from '@/lib/queries/team.queries';
import { createFileRoute, Outlet, redirect, useRouterState } from '@tanstack/react-router';

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
	// Prefetch what the shell needs (sidebar membership/org + the bell's notifications) so
	// it renders fully on first paint instead of suspending. `allSettled` keeps these
	// non-blocking: a 500 on any one (notifications especially — non-essential) must NOT
	// take down the whole (app)/* tree. Skipped on `/no-organization`, which renders bare
	// (no current org → membership-backed sidebar would 403).
	loader: async ({ context, location }) => {
		if (location.pathname === NO_ORGANIZATION_PATH) {
			return;
		}
		await Promise.allSettled([
			context.queryClient.ensureQueryData(notificationsListQueryOptions),
			context.queryClient.ensureQueryData(myMembershipQueryOptions),
			context.queryClient.ensureQueryData(myOrganizationsQueryOptions),
			// Sidebar reads this to padlock entitlement-gated nav items (calendar, catalog).
			context.queryClient.ensureQueryData(billingStatusQueryOptions)
		]);
	},
	component: RouteComponent
});

function RouteComponent() {
	const pathname = useRouterState({ select: s => s.location.pathname });

	// `/no-organization` is an empty-state page for users without a current org — it has no
	// sidebar/topbar chrome (those depend on a membership that doesn't exist yet).
	if (pathname === NO_ORGANIZATION_PATH) {
		return <Outlet />;
	}

	return (
		<>
			<BillingRequiredBanner />
			<AppShell>
				<Outlet />
			</AppShell>
			{import.meta.env.DEV && <DevRoleToggle />}
		</>
	);
}

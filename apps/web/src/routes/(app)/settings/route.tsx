import { billingStatusQueryOptions } from '@/lib/queries/billing.queries';
import { myMembershipQueryOptions } from '@/lib/queries/team.queries';
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

/**
 * Settings layout. EXTERNAL collaborators (contractors, accountants) are bounced to the home
 * page because connecting a personal mailbox would create the access-asymmetry /
 * confidentiality problems that justify the EXTERNAL role; the API enforces the same rule via
 * `TenantMemberGuard`.
 *
 * Settings navigation now lives in the sidebar: while on any settings route the "Instellingen"
 * item expands its children inline (see `SettingsSubNav` in `Sidebar.component.tsx`), so this
 * layout just renders the routed settings page. (Catalogus is a top-level page — its own sidebar
 * item at `/catalog` — not a settings sub-tab.)
 */
export const Route = createFileRoute('/(app)/settings')({
	beforeLoad: async ({ context }) => {
		const me = await context.queryClient.ensureQueryData(myMembershipQueryOptions);
		if (me.role === 'EXTERNAL') {
			throw redirect({ to: '/' });
		}
	},
	// Billing fuels the entitlement gating on subscription-gated settings pages (Prijsregels,
	// Integraties); prefetch so those pages render without suspending on billing state.
	loader: ({ context }) => context.queryClient.ensureQueryData(billingStatusQueryOptions),
	component: SettingsLayout
});

function SettingsLayout() {
	return <Outlet />;
}

import { SettingsNav } from '@/components/SettingsNav.component';
import { billingStatusQueryOptions } from '@/lib/queries/billing.queries';
import { myMembershipQueryOptions } from '@/lib/queries/team.queries';
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

/**
 * Settings layout. EXTERNAL collaborators (contractors, accountants) are bounced to the home
 * page because connecting a personal mailbox would create the access-asymmetry /
 * confidentiality problems that justify the EXTERNAL role; the API enforces the same rule via
 * `TenantMemberGuard`.
 *
 * Renders the shared `SettingsNav` tab bar above the routed settings page so every settings
 * feature (email, writing style, business details, catalog, pricing rules, follow-ups,
 * notifications, calendar sync) is reachable from one consistent place.
 */
export const Route = createFileRoute('/(app)/settings')({
	beforeLoad: async ({ context }) => {
		const me = await context.queryClient.ensureQueryData(myMembershipQueryOptions);
		if (me.role === 'EXTERNAL') {
			throw redirect({ to: '/' });
		}
	},
	// Billing fuels the SettingsNav lock indicators (subscription-gated tabs); prefetch so the
	// nav renders without suspending.
	loader: ({ context }) => context.queryClient.ensureQueryData(billingStatusQueryOptions),
	component: SettingsLayout
});

function SettingsLayout() {
	return (
		<>
			<SettingsNav />
			<Outlet />
		</>
	);
}

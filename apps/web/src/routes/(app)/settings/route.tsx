import { myMembershipQueryOptions } from '@/lib/queries/team.queries';
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

/**
 * Settings (currently: Email connection) is for primary members only — OWNER and MEMBER.
 * EXTERNAL collaborators (contractors, accountants) are bounced to the home page because
 * connecting a personal mailbox would create the access-asymmetry / confidentiality
 * problems that justify the EXTERNAL role in the first place. The API enforces the same
 * rule via `TenantMemberGuard` on every route.
 */
export const Route = createFileRoute('/(app)/settings')({
	beforeLoad: async ({ context }) => {
		const me = await context.queryClient.ensureQueryData(myMembershipQueryOptions);
		if (me.role === 'EXTERNAL') {
			throw redirect({ to: '/' });
		}
	},
	component: () => <Outlet />
});

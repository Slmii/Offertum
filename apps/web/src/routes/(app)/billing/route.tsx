import { myMembershipQueryOptions } from '@/lib/queries/team.queries';
import { createFileRoute, Outlet } from '@tanstack/react-router';

/**
 * Billing is open to every org member so non-owners land on the read-only upsell
 * ("Vraag de eigenaar om een abonnement") instead of being silently bounced home.
 * Every state-changing action (Checkout, Portal, end-trial) stays owner-only — the
 * API enforces that with `OwnerGuard`, and the page only renders those buttons for
 * owners. We prefetch the membership here so the page can branch on `isOwner` without
 * a render-then-fetch waterfall.
 */
export const Route = createFileRoute('/(app)/billing')({
	loader: ({ context }) => context.queryClient.ensureQueryData(myMembershipQueryOptions),
	component: () => <Outlet />
});

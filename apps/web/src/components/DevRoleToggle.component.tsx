import { myMembershipQueryOptions } from '@/lib/queries/team.queries';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import type { MembershipRole } from '@offertum/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * DEV-ONLY: floating controls that flip the current user's org role (OWNER ↔ MEMBER) and
 * super-admin flag in the query cache, so role-gated AND admin-gated UI can be tested without
 * a second account. Purely client-side — it overrides the cached membership; a hard reload or
 * a membership refetch reverts it. The mount site guards on `import.meta.env.DEV`, so this
 * never ships to production.
 *
 * Note: org role (OWNER/MEMBER) and admin are independent — the sidebar's ADMIN section is
 * gated by `user.isAdmin` (a super-admin allowlist), not by role, so it needs its own toggle.
 */
export function DevRoleToggle() {
	const queryClient = useQueryClient();
	const { data: membership } = useQuery(myMembershipQueryOptions);

	if (!membership) {
		return null;
	}

	const nextRole: MembershipRole = membership.role === 'OWNER' ? 'MEMBER' : 'OWNER';

	const toggleRole = () =>
		queryClient.setQueryData(myMembershipQueryOptions.queryKey, current => {
			if (!current) {
				return current;
			}

			// Switching to MEMBER simulates a plain member, so also drop super-admin — the
			// ADMIN sidebar section should vanish. Switching to OWNER leaves admin untouched
			// (owner ≠ super-admin); use the admin button below to test that dimension on its own.
			const isAdmin = nextRole === 'MEMBER' ? false : current.user.isAdmin;
			return { ...current, role: nextRole, user: { ...current.user, isAdmin } };
		});

	const toggleAdmin = () =>
		queryClient.setQueryData(myMembershipQueryOptions.queryKey, current =>
			current ? { ...current, user: { ...current.user, isAdmin: !current.user.isAdmin } } : current
		);

	return (
		<Stack
			direction='row'
			useFlexGap
			spacing={1}
			sx={theme => ({
				position: 'fixed',
				bottom: 16,
				right: 16,
				zIndex: theme.zIndex.tooltip + 1
			})}
		>
			<Button
				size='small'
				variant='contained'
				onClick={toggleRole}
				sx={{ textTransform: 'none', fontVariantNumeric: 'tabular-nums', boxShadow: 3 }}
			>
				dev · rol: {membership.role} → {nextRole}
			</Button>
			<Button
				size='small'
				variant='contained'
				color={membership.user.isAdmin ? 'success' : 'inherit'}
				onClick={toggleAdmin}
				sx={{ textTransform: 'none', boxShadow: 3 }}
			>
				admin: {membership.user.isAdmin ? 'aan' : 'uit'}
			</Button>
		</Stack>
	);
}

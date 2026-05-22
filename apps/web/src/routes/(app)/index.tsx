import { StandaloneSelect } from '@/components/Form/Select/Select.component';
import { createPageMeta } from '@/lib/createPageMeta';
import { useSignOut } from '@/lib/queries/auth.queries';
import {
	myMembershipQueryOptions,
	myOrganizationsQueryOptions,
	useSwitchOrganization
} from '@/lib/queries/team.queries';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';

export const Route = createFileRoute('/(app)/')({
	head: () => {
		return {
			meta: createPageMeta({
				title: 'Quoteom',
				description: 'Quote management for SMBs',
				path: '/'
			})
		};
	},
	loader: ({ context }) =>
		Promise.all([
			context.queryClient.ensureQueryData(myMembershipQueryOptions),
			context.queryClient.ensureQueryData(myOrganizationsQueryOptions)
		]),
	component: HomePage
});

function HomePage() {
	const navigate = useNavigate();
	const { session } = Route.useRouteContext();
	const { data: me } = useSuspenseQuery(myMembershipQueryOptions);
	const { data: organizations } = useSuspenseQuery(myOrganizationsQueryOptions);
	const switchOrganization = useSwitchOrganization();
	const signOut = useSignOut();

	const user = session?.user;
	if (!user) {
		return null;
	}

	const isOwner = me.role === 'OWNER';

	return (
		<Container maxWidth='sm' sx={{ py: 8 }}>
			<Paper variant='outlined' sx={{ p: 5 }}>
				<Typography variant='h1' sx={{ fontSize: 32, mb: 1 }}>
					Quoteom
				</Typography>
				<Typography variant='body2' color='text.secondary' sx={{ mb: 4 }}>
					Quote management for SMBs
				</Typography>

				<Stack spacing={2}>
					<Typography variant='body1' sx={{ mb: 1 }}>
						Signed in as <strong>{user.email}</strong>
					</Typography>

					<StandaloneSelect
						name='org'
						label='Actieve Organisatie'
						value={me.organizationId}
						onChange={e => switchOrganization.mutate(e.target.value)}
						disabled={switchOrganization.isPending}
						fullWidth
						options={organizations.map(org => ({
							id: org.organizationId,
							label: `${org.organization.name} · ${org.role.toLowerCase()}`
						}))}
					/>

					<Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
						<Button variant='contained' onClick={() => navigate({ to: '/opportunities' })}>
							Opportunities
						</Button>
						<Button variant='contained' onClick={() => navigate({ to: '/team' })}>
							Team
						</Button>
						{isOwner && (
							<Button variant='contained' onClick={() => navigate({ to: '/billing' })}>
								Billing
							</Button>
						)}
						{me.role !== 'EXTERNAL' && (
							<Button variant='contained' onClick={() => navigate({ to: '/settings/email' })}>
								Email
							</Button>
						)}
						{me.role !== 'EXTERNAL' && (
							<Button variant='outlined' onClick={() => navigate({ to: '/settings/writing-style' })}>
								Schrijfstijl
							</Button>
						)}
						{isOwner && (
							<Button variant='outlined' onClick={() => navigate({ to: '/settings/follow-ups' })}>
								Follow-ups
							</Button>
						)}
						{me.user.isAdmin && (
							<Button variant='outlined' onClick={() => navigate({ to: '/admin/ai-usage' })}>
								AI usage (dev)
							</Button>
						)}
						{me.user.isAdmin && (
							<Button variant='outlined' onClick={() => navigate({ to: '/admin/classifier-quality' })}>
								Classifier quality (dev)
							</Button>
						)}
						<Button variant='outlined' onClick={() => signOut.mutate()} disabled={signOut.isPending}>
							{signOut.isPending ? 'Signing out...' : 'Sign out'}
						</Button>
					</Box>
				</Stack>
			</Paper>
		</Container>
	);
}

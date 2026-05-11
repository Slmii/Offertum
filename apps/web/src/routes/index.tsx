import { useSession, useSignOut } from '@/lib/hooks/auth.hooks';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { createFileRoute, useNavigate } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
	component: HomePage
});

function HomePage() {
	const navigate = useNavigate();
	const session = useSession();
	const signOut = useSignOut();

	if (session.isLoading) {
		return (
			<Container maxWidth='sm' sx={{ py: 8 }}>
				<Typography color='text.secondary'>Loading...</Typography>
			</Container>
		);
	}

	const user = session.data?.user;

	return (
		<Container maxWidth='sm' sx={{ py: 8 }}>
			<Paper variant='outlined' sx={{ p: 5 }}>
				<Typography variant='h1' sx={{ fontSize: 32, mb: 1 }}>
					Quoteom
				</Typography>
				<Typography variant='body2' color='text.secondary' sx={{ mb: 4 }}>
					Quote management for SMBs
				</Typography>

				{user ? (
					<Box>
						<Typography variant='body1' sx={{ mb: 1 }}>
							Signed in as <strong>{user.email}</strong>
						</Typography>
						<Typography variant='body2' color='text.secondary' sx={{ mb: 4 }}>
							Active organization: <code>{user.organizationId ?? '— no active organization —'}</code>
						</Typography>

						<Button variant='outlined' onClick={() => signOut.mutate()} disabled={signOut.isPending}>
							{signOut.isPending ? 'Signing out...' : 'Sign out'}
						</Button>
					</Box>
				) : (
					<Box>
						<Typography variant='body1' sx={{ mb: 3 }}>
							You're not signed in.
						</Typography>
						<Button variant='contained' size='large' onClick={() => navigate({ to: '/sign-in' })}>
							Sign in
						</Button>
					</Box>
				)}
			</Paper>
		</Container>
	);
}

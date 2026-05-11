import { useSession, useSignOut } from '@/lib/auth/queries';
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

	console.log('Session data:', session.data);

	if (session.isLoading) {
		return (
			<Container maxWidth='sm' sx={{ py: 8 }}>
				<Typography color='text.secondary'>Bezig met laden...</Typography>
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
					Offerte management voor MKB
				</Typography>

				{user ? (
					<Box>
						<Typography variant='body1' sx={{ mb: 1 }}>
							Ingelogd als <strong>{user.email}</strong>
						</Typography>
						<Typography variant='body2' color='text.secondary' sx={{ mb: 4 }}>
							Actieve organisatie: <code>{user.organizationId ?? '— geen actieve organisatie —'}</code>
						</Typography>

						<Button variant='outlined' onClick={() => signOut.mutate()} disabled={signOut.isPending}>
							{signOut.isPending ? 'Uitloggen...' : 'Uitloggen'}
						</Button>
					</Box>
				) : (
					<Box>
						<Typography variant='body1' sx={{ mb: 3 }}>
							Je bent niet ingelogd.
						</Typography>
						<Button variant='contained' size='large' onClick={() => navigate({ to: '/sign-in' })}>
							Inloggen
						</Button>
					</Box>
				)}
			</Paper>
		</Container>
	);
}

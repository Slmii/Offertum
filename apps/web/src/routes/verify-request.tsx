import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { createFileRoute, Link } from '@tanstack/react-router';
import { z } from 'zod';

const SearchSchema = z.object({
	email: z.string().optional()
});

export const Route = createFileRoute('/verify-request')({
	validateSearch: SearchSchema,
	component: VerifyRequestPage
});

function VerifyRequestPage() {
	const { email } = Route.useSearch();

	return (
		<Container maxWidth='xs' sx={{ py: 8 }}>
			<Paper variant='outlined' sx={{ p: 5, textAlign: 'center' }}>
				<Typography variant='h1' sx={{ fontSize: 28, mb: 2 }}>
					Check je inbox
				</Typography>
				<Typography variant='body1' color='text.secondary' sx={{ mb: 1 }}>
					{email
						? `We hebben een magic link gestuurd naar ${email}.`
						: 'We hebben een magic link gestuurd.'}
				</Typography>
				<Typography variant='body2' color='text.secondary' sx={{ mb: 4 }}>
					Klik op de link in de e-mail om in te loggen. De link verloopt over 24 uur.
				</Typography>
				<Typography variant='caption' color='text.secondary'>
					Niets ontvangen?{' '}
					<Link to='/sign-in' style={{ color: 'inherit' }}>
						Probeer opnieuw
					</Link>
				</Typography>
			</Paper>
		</Container>
	);
}

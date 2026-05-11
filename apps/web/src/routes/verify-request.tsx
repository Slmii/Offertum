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
					Check your inbox
				</Typography>
				<Typography variant='body1' color='text.secondary' sx={{ mb: 1 }}>
					{email ? `We sent a magic link to ${email}.` : 'We sent a magic link.'}
				</Typography>
				<Typography variant='body2' color='text.secondary' sx={{ mb: 4 }}>
					Click the link in the email to sign in. The link expires in 24 hours.
				</Typography>
				<Typography variant='caption' color='text.secondary'>
					Didn't receive it?{' '}
					<Link to='/sign-in' style={{ color: 'inherit' }}>
						Try again
					</Link>
				</Typography>
			</Paper>
		</Container>
	);
}

import { Body, BodySmall, H1 } from '@/components/Text.component';
import { VerifyRequestSearchSchema } from '@/lib/schemas/auth.schema';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/(auth)/verify-request')({
	validateSearch: VerifyRequestSearchSchema,
	component: VerifyRequestPage
});

function VerifyRequestPage() {
	const { email } = Route.useSearch();

	return (
		<Container maxWidth='xs' sx={{ py: 8 }}>
			<Paper variant='outlined' sx={{ p: 5, textAlign: 'center' }}>
				<H1 sx={{ mb: 2 }}>Check your inbox</H1>
				<Body color='textSecondary' sx={{ mb: 1 }}>
					{email ? `We sent a magic link to ${email}.` : 'We sent a magic link.'}
				</Body>
				<BodySmall color='textSecondary' sx={{ display: 'block', mb: 4 }}>
					Click the link in the email to sign in. The link expires in 24 hours.
				</BodySmall>
				<BodySmall color='textSecondary' sx={{ display: 'block' }}>
					Didn't receive it?{' '}
					<Link to='/sign-in' style={{ color: 'inherit' }}>
						Try again
					</Link>
				</BodySmall>
			</Paper>
		</Container>
	);
}

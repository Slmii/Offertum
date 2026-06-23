import { Body, H1 } from '@/components/Text.component';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import { createFileRoute, useNavigate } from '@tanstack/react-router';

export const Route = createFileRoute('/(app)/billing/cancel')({
	component: BillingCancelPage
});

function BillingCancelPage() {
	const navigate = useNavigate();

	return (
		<Container maxWidth='sm' sx={{ py: 6 }}>
			<Paper variant='outlined' sx={{ p: 5, textAlign: 'center' }}>
				<H1 sx={{ mb: 1 }}>Checkout canceled</H1>
				<Body color='textSecondary' sx={{ mb: 4 }}>
					No payment was processed. You can start your trial whenever you're ready.
				</Body>
				<Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
					<Button variant='contained' onClick={() => navigate({ to: '/billing' })}>
						Try again
					</Button>
					<Button variant='outlined' onClick={() => navigate({ to: '/' })}>
						Back to dashboard
					</Button>
				</Box>
			</Paper>
		</Container>
	);
}

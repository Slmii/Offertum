import { Body, BodySmall, H1 } from '@/components/Text.component';
import { useSyncBilling } from '@/lib/queries/billing.queries';
import { BillingSearchSchema } from '@/lib/schemas/billing.schema';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';

export const Route = createFileRoute('/(app)/billing/success')({
	validateSearch: BillingSearchSchema,
	component: BillingSuccessPage
});

function BillingSuccessPage() {
	const navigate = useNavigate();
	const sync = useSyncBilling();

	// Eagerly call sync so we're not waiting on the Stripe webhook to update local state.
	// Theo's pattern: race the webhook to make sure the user sees fresh state immediately
	// after returning from Checkout.
	useEffect(() => {
		sync.mutate();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return (
		<Container maxWidth='sm' sx={{ py: 6 }}>
			<Paper variant='outlined' sx={{ p: 5, textAlign: 'center' }}>
				{sync.isPending && (
					<Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
						<CircularProgress size={32} />
						<BodySmall color='textSecondary'>Confirming your subscription…</BodySmall>
					</Box>
				)}

				{sync.isSuccess && (
					<Box>
						<H1 sx={{ mb: 1 }}>You're all set</H1>
						<Body color='textSecondary' sx={{ mb: 4 }}>
							Your trial has started. No card needed — add a payment method when you're ready to continue
							after the 14 days. Cancel any time.
						</Body>
						<Button variant='contained' size='large' onClick={() => navigate({ to: '/' })}>
							Go to dashboard
						</Button>
					</Box>
				)}

				{sync.isError && (
					<Box>
						<H1 sx={{ mb: 1 }}>Payment received</H1>
						<Body color='textSecondary' sx={{ mb: 4 }}>
							We received your payment but couldn't refresh your subscription state. It will sync shortly
							via Stripe webhooks, refresh in a minute.
						</Body>
						<Button variant='outlined' onClick={() => navigate({ to: '/' })}>
							Go to dashboard
						</Button>
					</Box>
				)}
			</Paper>
		</Container>
	);
}

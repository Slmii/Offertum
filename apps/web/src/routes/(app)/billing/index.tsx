import { BackToHomeButton } from '@/components/BackToHomeButton.component';
import { SectionError } from '@/components/SectionError.component';
import {
	billingStatusQueryOptions,
	isBillingEntitled,
	useEndTrial,
	useOpenPortal,
	useStartCheckout
} from '@/lib/queries/billing.queries';
import { toReadableDate } from '@/lib/utils/date.utils';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import type { SxProps, Theme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import type { BillingStatus } from '@offertum/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';

export const Route = createFileRoute('/(app)/billing/')({
	loader: ({ context }) => context.queryClient.ensureQueryData(billingStatusQueryOptions),
	component: BillingPage,
	errorComponent: SectionError
});

function BillingPage() {
	const { data: status } = useSuspenseQuery(billingStatusQueryOptions);
	const startCheckout = useStartCheckout();
	const openPortal = useOpenPortal();
	const endTrial = useEndTrial();
	const [confirmUpgradeOpen, setConfirmUpgradeOpen] = useState(false);

	const showUpgrade = shouldShowUpgrade(status);
	const hasPrimaryAction = shouldShowSubscribe(status) || showUpgrade;
	const isEntitled = isBillingEntitled(status.state);

	const confirmUpgrade = () =>
		endTrial.mutate(undefined, {
			// Close only on a real upgrade. `ok: false` means we ended the trial but the charge
			// didn't go through (declined card → past_due) — keep the dialog open so the
			// payment-incomplete notice is visible instead of silently reporting success.
			onSuccess: data => {
				if (data.ok) {
					setConfirmUpgradeOpen(false);
				}
			}
		});

	const upgradeIncomplete = endTrial.isSuccess && !endTrial.data.ok;

	return (
		<Container maxWidth='sm' sx={{ py: 8 }}>
			{/* Value-prop panel: most prominent position for non-entitled visitors (no sub yet /
			    canceled). Entitled users see it too for reinforcement, but below the status block. */}
			{!isEntitled && <ValuePropPanel />}

			<Paper variant='outlined' sx={{ p: 5 }}>
				<Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 1 }}>
					<Typography variant='h1' sx={{ fontSize: 28 }}>
						Billing
					</Typography>
					<BackToHomeButton />
				</Box>
				<Typography variant='body2' color='text.secondary' sx={{ mb: 4 }}>
					Manage your Offertum subscription. {formatEuros(status.seats.baseMonthlyPriceCents)}/month after a
					14-day free trial.
				</Typography>

				<StatusPanel
					status={status}
					onOpenPortal={() => openPortal.mutate()}
					portalOpening={openPortal.isPending}
				/>

				{isEntitled && <ValuePropPanel sx={{ mt: 0, mb: 3 }} />}

				{(startCheckout.isError || openPortal.isError || endTrial.isError) && (
					<Alert severity='error' sx={{ mb: 3, mt: 2 }}>
						{startCheckout.error instanceof Error
							? startCheckout.error.message
							: openPortal.error instanceof Error
								? openPortal.error.message
								: endTrial.error instanceof Error
									? endTrial.error.message
									: 'Something went wrong. Please try again.'}
					</Alert>
				)}

				<Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 3 }}>
					{shouldShowSubscribe(status) && (
						<Button
							variant='contained'
							size='large'
							onClick={() => startCheckout.mutate()}
							disabled={startCheckout.isPending}
						>
							{startCheckout.isPending ? 'Redirecting...' : subscribeLabel(status.state)}
						</Button>
					)}

					{showUpgrade && (
						<Button
							variant='contained'
							size='large'
							onClick={() => setConfirmUpgradeOpen(true)}
							disabled={endTrial.isPending}
						>
							{endTrial.isPending ? 'Upgrading...' : 'Upgrade to paid now'}
						</Button>
					)}

					{shouldShowManage(status) && (
						<Button
							variant={hasPrimaryAction ? 'outlined' : 'contained'}
							size={hasPrimaryAction ? 'medium' : 'large'}
							onClick={() => openPortal.mutate()}
							disabled={openPortal.isPending}
						>
							{openPortal.isPending ? 'Opening...' : portalLabel(status.state)}
						</Button>
					)}
				</Box>

				<Typography variant='caption' color='text.secondary' sx={{ display: 'block', mt: 4 }}>
					Pay with card, iDEAL, or SEPA Direct Debit. Cancel any time.
				</Typography>
			</Paper>

			<Dialog open={confirmUpgradeOpen} onClose={() => setConfirmUpgradeOpen(false)} maxWidth='xs' fullWidth>
				<DialogTitle>End trial and subscribe now?</DialogTitle>
				<DialogContent>
					<DialogContentText>
						This ends your free trial immediately. Your saved payment method will be charged for the{' '}
						{formatEuros(status.seats.baseMonthlyPriceCents)}/month plan (plus any applicable VAT) and your
						subscription becomes active right away. You can then invite teammates beyond the{' '}
						{status.seats.included}-seat trial limit. Extra seats are{' '}
						{formatEuros(status.seats.overagePerSeatCents)}/month each.
					</DialogContentText>
					{endTrial.isError && (
						<Alert severity='error' sx={{ mt: 2 }}>
							{endTrial.error instanceof Error
								? endTrial.error.message
								: 'Upgrade failed. Please try again.'}
						</Alert>
					)}
					{upgradeIncomplete && (
						<Alert severity='warning' sx={{ mt: 2 }}>
							Your trial was ended, but the payment didn’t go through. Close this and use “Manage
							subscription” to update your payment method.
						</Alert>
					)}
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setConfirmUpgradeOpen(false)} disabled={endTrial.isPending}>
						Cancel
					</Button>
					<Button variant='contained' onClick={confirmUpgrade} disabled={endTrial.isPending}>
						{endTrial.isPending ? 'Upgrading...' : 'Subscribe now'}
					</Button>
				</DialogActions>
			</Dialog>
		</Container>
	);
}

function StatusPanel({
	status,
	onOpenPortal,
	portalOpening
}: {
	status: BillingStatus;
	onOpenPortal: () => void;
	portalOpening: boolean;
}) {
	const { state, currentPeriodEnd, cancelAtPeriodEnd, isPaymentProcessing, paymentMethodBrand, paymentMethodLast4 } =
		status;
	const endDate = currentPeriodEnd ? new Date(currentPeriodEnd) : null;
	const chip = stateChip(state, isPaymentProcessing);
	const showCancellationBanner = cancelAtPeriodEnd && endDate !== null;

	return (
		<Box sx={{ mb: 3 }}>
			<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
				<Typography variant='overline' color='text.secondary'>
					Current plan
				</Typography>
				<Chip size='small' color={chip.color} label={chip.label} />
			</Box>

			<Typography variant='body1' sx={{ mb: 0.5 }}>
				{primaryLine(state, endDate, isPaymentProcessing)}
			</Typography>
			{secondaryLine(state, isPaymentProcessing) && (
				<Typography variant='body2' color='text.secondary'>
					{secondaryLine(state, isPaymentProcessing)}
				</Typography>
			)}

			{showCancellationBanner && (
				<Alert
					severity='warning'
					sx={{ mt: 2 }}
					action={
						<Button color='inherit' size='small' onClick={onOpenPortal} disabled={portalOpening}>
							{portalOpening ? 'Opening...' : 'Resume'}
						</Button>
					}
				>
					{state === 'trialing'
						? `Trial ends ${toReadableDate(endDate, 'D MMM YYYY')}. You won't be charged. Resume to start your paid subscription.`
						: `Cancellation scheduled for ${toReadableDate(endDate, 'D MMM YYYY')}. Your access stays active until then. Resume to keep your subscription.`}
				</Alert>
			)}

			<Divider sx={{ my: 2 }} />
			<SeatsLine seats={status.seats} state={state} />

			{paymentMethodBrand && paymentMethodLast4 && (
				<>
					<Divider sx={{ my: 2 }} />
					<Typography variant='body2' color='text.secondary'>
						Payment method: {formatPaymentMethod(paymentMethodBrand)} ending in {paymentMethodLast4}
					</Typography>
				</>
			)}
		</Box>
	);
}

function SeatsLine({ seats, state }: { seats: BillingStatus['seats']; state: BillingStatus['state'] }) {
	const isTrial = state === 'trialing';
	const isUnsubscribed = state === 'none';
	const overage = Math.max(0, seats.used - seats.included);
	const overageCents = overage * seats.overagePerSeatCents;
	const remaining = Math.max(0, seats.included - seats.used);

	return (
		<Box>
			<Typography variant='body2'>
				<strong>Seats:</strong> {seats.used} used · {seats.included}{' '}
				{isTrial ? 'max during trial' : 'included in base price'}
			</Typography>

			{isUnsubscribed && (
				<Typography variant='body2' color='text.secondary' sx={{ mt: 0.5 }}>
					Start your trial to invite teammates. The first {seats.included} seats are included in the base
					price; additional seats are {formatEuros(seats.overagePerSeatCents)}/month each.
				</Typography>
			)}

			{isTrial && (
				<Typography variant='body2' color='text.secondary' sx={{ mt: 0.5 }}>
					{remaining > 0
						? `You can invite ${remaining} more teammate${remaining === 1 ? '' : 's'} during the trial. Subscribe to grow past ${seats.included} seats.`
						: `Trial seat limit reached. Subscribe to invite more teammates.`}
				</Typography>
			)}

			{!isTrial && !isUnsubscribed && overage > 0 && (
				<Typography variant='body2' color='text.secondary' sx={{ mt: 0.5 }}>
					{overage} extra seat{overage === 1 ? '' : 's'} × {formatEuros(seats.overagePerSeatCents)}/mo ={' '}
					<strong>{formatEuros(overageCents)}/mo overage</strong>
				</Typography>
			)}

			{!isTrial && !isUnsubscribed && overage === 0 && remaining > 0 && (
				<Typography variant='body2' color='text.secondary' sx={{ mt: 0.5 }}>
					Invite up to {remaining} more without overage charges.
				</Typography>
			)}
		</Box>
	);
}

const VALUE_PROP_BULLETS = [
	'Gmail & Outlook koppelen en aanvragen automatisch binnenhalen',
	'AI-antwoorden in jouw eigen schrijfstijl',
	'Offerte-PDF’s genereren en versturen',
	'Automatische follow-ups en slimme verloop-acties',
	'Dagelijks overzicht van je belangrijkste offertes',
	'Agenda-sync naar je telefoon en teamleden uitnodigen'
] as const;

/**
 * "Wat je krijgt met Offertum" feature-bullet panel.
 * Rendered above the billing card for non-entitled owners (most visible CTA position),
 * and inside the billing card — below the StatusPanel — for entitled users (reinforcement).
 * The `sx` prop allows placement-specific spacing overrides.
 */
function ValuePropPanel({ sx }: { sx?: SxProps<Theme> }) {
	return (
		<Paper variant='outlined' sx={[{ p: 3, mb: 3 }, ...(Array.isArray(sx) ? sx : sx != null ? [sx] : [])]}>
			<Stack useFlexGap spacing={2}>
				<Typography variant='h6' component='h2' sx={{ fontWeight: 600 }}>
					Wat je krijgt met Offertum
				</Typography>

				<Stack useFlexGap spacing={1}>
					{VALUE_PROP_BULLETS.map(bullet => (
						<Stack key={bullet} direction='row' useFlexGap spacing={1} sx={{ alignItems: 'flex-start' }}>
							<CheckGlyph />
							<Typography variant='body2'>{bullet}</Typography>
						</Stack>
					))}
				</Stack>
			</Stack>
		</Paper>
	);
}

function CheckGlyph() {
	return (
		<svg
			xmlns='http://www.w3.org/2000/svg'
			width='16'
			height='16'
			viewBox='0 0 24 24'
			fill='currentColor'
			aria-hidden='true'
			style={{ color: 'inherit', opacity: 0.6, flexShrink: 0, marginTop: 2 }}
		>
			<path d='M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z' />
		</svg>
	);
}

function formatEuros(cents: number): string {
	// Deterministic across SSR/client — same reasoning as formatDate.
	const whole = Math.floor(cents / 100);
	const remainder = cents % 100;
	if (remainder === 0) {
		return `€${whole}`;
	}
	return `€${whole}.${remainder.toString().padStart(2, '0')}`;
}

function stateChip(
	state: BillingStatus['state'],
	isPaymentProcessing: boolean
): {
	color: 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info';
	label: string;
} {
	switch (state) {
		case 'none':
			return { color: 'default', label: 'No plan' };
		case 'trialing':
			return { color: 'primary', label: 'Trial' };
		case 'active':
			return { color: 'success', label: 'Active' };
		case 'past_due':
			return isPaymentProcessing
				? { color: 'info', label: 'Payment processing' }
				: { color: 'warning', label: 'Payment failed' };
		case 'paused':
			return { color: 'warning', label: 'Paused' };
		case 'canceled':
		case 'unpaid':
		case 'incomplete_expired':
			return { color: 'error', label: 'Inactive' };
		case 'incomplete':
			return { color: 'warning', label: 'Incomplete' };
	}
}

function primaryLine(state: BillingStatus['state'], endDate: Date | null, isPaymentProcessing: boolean): string {
	switch (state) {
		case 'none':
			return "You haven't started your trial yet.";
		case 'trialing':
			return `Free trial — first charge on ${endDate ? toReadableDate(endDate, 'D MMM YYYY') : '-'}`;
		case 'active':
			return `Subscription active — renews ${endDate ? toReadableDate(endDate, 'D MMM YYYY') : '-'}`;
		case 'past_due':
			return isPaymentProcessing
				? 'Payment processing — bank debits (SEPA) can take a few days to clear.'
				: "We couldn't collect your last payment.";
		case 'paused':
			return 'Subscription paused.';
		case 'canceled':
			return 'Subscription canceled.';
		case 'unpaid':
			return 'Subscription unpaid.';
		case 'incomplete':
			return 'Subscription setup incomplete.';
		case 'incomplete_expired':
			return 'Subscription setup expired.';
	}
}

function secondaryLine(state: BillingStatus['state'], isPaymentProcessing: boolean): string | null {
	switch (state) {
		case 'none':
			return 'Start your 14-day free trial. A card is required at signup, but you won’t be charged for 14 days. Cancel any time before then.';
		case 'past_due':
			return isPaymentProcessing
				? 'No action needed — we’ll confirm once your bank completes the payment.'
				: 'Update your payment method to keep your subscription active.';
		case 'canceled':
			return 'Subscribe again to restore access.';
		default:
			return null;
	}
}

function formatPaymentMethod(brand: string): string {
	if (brand === 'card') {
		return 'Card';
	}
	if (brand === 'sepa_debit') {
		return 'SEPA Direct Debit';
	}
	return brand.charAt(0).toUpperCase() + brand.slice(1);
}

const SUBSCRIBE_STATES: ReadonlyArray<BillingStatus['state']> = ['none', 'canceled', 'incomplete_expired', 'unpaid'];

function shouldShowSubscribe(status: BillingStatus): boolean {
	return SUBSCRIBE_STATES.includes(status.state);
}

// "Upgrade to paid now" converts a trial to an active subscription early (ends the Stripe
// trial + charges the saved card) — the only in-product path past the trial seat cap.
function shouldShowUpgrade(status: BillingStatus): boolean {
	return status.state === 'trialing';
}

function shouldShowManage(status: BillingStatus): boolean {
	// Anyone with a Stripe customer record can open the Portal — even canceled customers
	// may want to see past invoices. Only hide it before they've ever subscribed.
	return status.state !== 'none';
}

function subscribeLabel(state: BillingStatus['state']): string {
	if (state === 'none') {
		return 'Start your 14-day free trial';
	}
	return 'Subscribe';
}

// For terminal states the Portal can only show invoice history (no active sub to manage),
// so the label changes to match. Everything else stays "Manage subscription".
function portalLabel(state: BillingStatus['state']): string {
	switch (state) {
		case 'canceled':
		case 'unpaid':
		case 'incomplete_expired':
			return 'View past invoices';
		default:
			return 'Manage subscription';
	}
}

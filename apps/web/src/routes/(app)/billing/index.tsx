import { AppIcon, type AppIconName } from '@/components/AppIcon.component';
import { Banner } from '@/components/Banner.component';
import { PageHeader } from '@/components/PageContainer.component';
import { SectionError } from '@/components/SectionError.component';
import { Body, BodySmall, H2, H3, Mono, Overline } from '@/components/Text.component';
import {
	billingStatusQueryOptions,
	isBillingEntitled,
	useEndTrial,
	useOpenPortal,
	useStartCheckout
} from '@/lib/queries/billing.queries';
import { myMembershipQueryOptions } from '@/lib/queries/team.queries';
import { toReadableDate } from '@/lib/utils/date.utils';
import { toReadableEuro } from '@/lib/utils/number.utils';
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
import { useTheme } from '@mui/material/styles';
import type { BillingStatus } from '@offertum/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { MOCK_NEXT_INVOICE, MOCK_STRIPE_CUSTOMER_ID, type NextInvoice } from './billing-invoices.mock';

export const Route = createFileRoute('/(app)/billing/')({
	loader: ({ context }) => context.queryClient.ensureQueryData(billingStatusQueryOptions),
	component: BillingPage,
	errorComponent: SectionError
});

function BillingPage() {
	const { data: status } = useSuspenseQuery(billingStatusQueryOptions);
	const { data: me } = useSuspenseQuery(myMembershipQueryOptions);
	const isOwner = me.role === 'OWNER';
	const isEntitled = isBillingEntitled(status.state);

	// Not entitled (no sub / canceled / expired): calm upsell landing, never an error.
	if (!isEntitled) {
		return <BillingUpsellLanding status={status} isOwner={isOwner} />;
	}

	return <BillingManagePage status={status} />;
}

/* ===================== Entitled — manage subscription ===================== */

function BillingManagePage({ status }: { status: BillingStatus }) {
	const startCheckout = useStartCheckout();
	const openPortal = useOpenPortal();
	const endTrial = useEndTrial();
	const [confirmUpgradeOpen, setConfirmUpgradeOpen] = useState(false);

	const showUpgrade = shouldShowUpgrade(status);
	const hasPrimaryAction = shouldShowSubscribe(status) || showUpgrade;

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
		<Stack>
			<Stack useFlexGap spacing={3}>
				<PageHeader title='Abonnement' disableMargin />

				<Paper variant='outlined' sx={{ p: 4 }}>
					<StatusPanel
						status={status}
						onOpenPortal={() => openPortal.mutate()}
						portalOpening={openPortal.isPending}
					/>

					{(startCheckout.isError || openPortal.isError || endTrial.isError) && (
						<Banner tone='error' sx={{ mt: 2 }}>
							{startCheckout.error instanceof Error
								? startCheckout.error.message
								: openPortal.error instanceof Error
									? openPortal.error.message
									: endTrial.error instanceof Error
										? endTrial.error.message
										: 'Er ging iets mis. Probeer het opnieuw.'}
						</Banner>
					)}

					<Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 3 }}>
						{shouldShowSubscribe(status) && (
							<Button
								variant='contained'
								size='large'
								onClick={() => startCheckout.mutate()}
								disabled={startCheckout.isPending}
							>
								{startCheckout.isPending ? 'Doorverwijzen...' : subscribeLabel(status.state)}
							</Button>
						)}

						{showUpgrade && (
							<Button
								variant='contained'
								size='large'
								onClick={() => setConfirmUpgradeOpen(true)}
								disabled={endTrial.isPending}
							>
								{endTrial.isPending ? 'Upgraden...' : 'Nu naar betaald upgraden'}
							</Button>
						)}

						{shouldShowManage(status) && (
							<Button
								variant={hasPrimaryAction ? 'outlined' : 'contained'}
								size={hasPrimaryAction ? 'medium' : 'large'}
								startIcon={<AppIcon name='external-link' size='medium' />}
								onClick={() => openPortal.mutate()}
								disabled={openPortal.isPending}
							>
								{openPortal.isPending ? 'Openen...' : portalLabel(status.state)}
							</Button>
						)}
					</Box>

					<BodySmall color='text.secondary' sx={{ mt: 3 }}>
						Betaal met kaart, iDEAL of SEPA-incasso. Maandelijks opzegbaar.
					</BodySmall>
				</Paper>

				<SeatsCard seats={status.seats} state={status.state} />

				{/* MOCK — next-invoice + past-invoices have no backend yet (see billing-invoices.mock.ts). */}
				<NextInvoiceCard invoice={MOCK_NEXT_INVOICE} />
			</Stack>

			<Dialog open={confirmUpgradeOpen} onClose={() => setConfirmUpgradeOpen(false)} maxWidth='xs' fullWidth>
				<DialogTitle>Proefperiode beëindigen en nu abonneren?</DialogTitle>
				<DialogContent>
					<DialogContentText>
						Hiermee stopt je gratis proefperiode meteen. Je opgeslagen betaalmethode wordt belast voor het{' '}
						{toReadableEuro(status.seats.baseMonthlyPriceCents / 100)}/maand-abonnement (plus eventuele btw)
						en je abonnement wordt direct actief. Je kunt dan teamleden uitnodigen voorbij de{' '}
						{status.seats.included}-zitplekken-proeflimiet. Extra zitplekken kosten{' '}
						{toReadableEuro(status.seats.overagePerSeatCents / 100)}/maand per stuk.
					</DialogContentText>
					{endTrial.isError && (
						<Banner tone='error' sx={{ mt: 2 }}>
							{endTrial.error instanceof Error
								? endTrial.error.message
								: 'Upgraden mislukt. Probeer het opnieuw.'}
						</Banner>
					)}
					{upgradeIncomplete && (
						<Banner tone='warning' sx={{ mt: 2 }}>
							Je proefperiode is beëindigd, maar de betaling is niet gelukt. Sluit dit en gebruik “Beheer
							abonnement” om je betaalmethode bij te werken.
						</Banner>
					)}
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setConfirmUpgradeOpen(false)} disabled={endTrial.isPending}>
						Annuleren
					</Button>
					<Button variant='contained' onClick={confirmUpgrade} disabled={endTrial.isPending}>
						{endTrial.isPending ? 'Upgraden...' : 'Nu abonneren'}
					</Button>
				</DialogActions>
			</Dialog>
		</Stack>
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
		<Box>
			<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
				<Overline color='text.secondary'>Huidig abonnement</Overline>
				<Chip size='small' color={chip.color} label={chip.label} />
			</Box>

			<Body sx={{ mb: 0.5 }}>{primaryLine(state, endDate, isPaymentProcessing)}</Body>
			{secondaryLine(state, isPaymentProcessing) && (
				<BodySmall color='text.secondary'>{secondaryLine(state, isPaymentProcessing)}</BodySmall>
			)}

			<StripeCustomerIdRow customerId={MOCK_STRIPE_CUSTOMER_ID} />

			{showCancellationBanner && (
				<Banner
					tone='warning'
					sx={{ mt: 2 }}
					action={
						<Button color='inherit' size='small' onClick={onOpenPortal} disabled={portalOpening}>
							{portalOpening ? 'Openen...' : 'Hervatten'}
						</Button>
					}
				>
					{state === 'trialing'
						? `Proefperiode loopt af op ${toReadableDate(endDate as Date, 'D MMM YYYY')}. Je wordt niet belast. Hervat om je betaalde abonnement te starten.`
						: `Opzegging gepland voor ${toReadableDate(endDate as Date, 'D MMM YYYY')}. Je toegang blijft actief tot dan. Hervat om je abonnement te behouden.`}
				</Banner>
			)}

			{paymentMethodBrand && paymentMethodLast4 && (
				<>
					<Divider sx={{ my: 2 }} />
					<BodySmall color='text.secondary'>
						Betaalmethode: {formatPaymentMethod(paymentMethodBrand)} eindigend op {paymentMethodLast4}
					</BodySmall>
				</>
			)}
		</Box>
	);
}

/**
 * MOCK — the Stripe Customer ID is not yet returned by `GET /api/billing/status`.
 * Rendered with a copy-to-clipboard button (clipboard can fail in non-secure contexts;
 * the ID stays visible so it can be copied manually as a fallback).
 */
function StripeCustomerIdRow({ customerId }: { customerId: string }) {
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(customerId);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			setCopied(false);
		}
	};

	return (
		<Stack direction='row' useFlexGap spacing={1} sx={{ alignItems: 'center', mt: 1 }}>
			<BodySmall color='text.secondary' component='span'>
				Stripe Customer ID:
			</BodySmall>
			<Mono color='text.secondary' sx={{ fontSize: 12 }}>
				{customerId}
			</Mono>
			<Button
				size='small'
				variant='outlined'
				color='inherit'
				startIcon={<AppIcon name='copy' size='small' />}
				onClick={handleCopy}
				sx={{ minWidth: 0, py: 0.25, px: 1 }}
			>
				{copied ? 'Gekopieerd' : 'Kopieer'}
			</Button>
		</Stack>
	);
}

/* ===================== Seats ===================== */

function SeatsCard({ seats, state }: { seats: BillingStatus['seats']; state: BillingStatus['state'] }) {
	const { tokens } = useTheme();
	const overage = Math.max(0, seats.used - seats.included);
	const overageCents = overage * seats.overagePerSeatCents;
	const totalCents = seats.baseMonthlyPriceCents + overageCents;

	// Bar fills to the used/included ratio, capped at 100%. The included-seats marker sits at
	// the point where the base price stops covering seats (clamped so it stays on the track).
	const denominator = Math.max(seats.included, seats.used, 1);
	const fillPct = Math.min(100, (seats.used / denominator) * 100);
	const markerPct = Math.min(100, (seats.included / denominator) * 100);

	return (
		<Paper variant='outlined' sx={{ p: 3 }}>
			<H2 component='h2' sx={{ fontSize: 18, mb: 2 }}>
				Zitplekken
			</H2>

			<Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, flexWrap: 'wrap', mb: 1.5 }}>
				<SeatStat value={seats.included} label='inbegrepen' />
				<SeatSeparator>·</SeatSeparator>
				<SeatStat value={seats.used} label='gebruikt' />
				<SeatSeparator>=</SeatSeparator>
				<Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
					<Box component='span' sx={{ fontSize: 22, fontWeight: 'bold', color: tokens.color.ink1 }}>
						{toReadableEuro(totalCents / 100)}
					</Box>
					<Box component='span' sx={{ fontSize: 14, color: tokens.color.ink3 }}>
						/maand
					</Box>
				</Box>
			</Box>

			{/* Usage progress bar — fill to used/included ratio + included-seats marker. */}
			<Box
				role='progressbar'
				aria-label={`${seats.used} van ${seats.included} inbegrepen zitplekken in gebruik`}
				aria-valuenow={seats.used}
				aria-valuemin={0}
				aria-valuemax={denominator}
				sx={{
					position: 'relative',
					height: 8,
					borderRadius: tokens.radius.sm / 4,
					bgcolor: tokens.color.paper3,
					overflow: 'hidden'
				}}
			>
				<Box sx={{ width: `${fillPct}%`, height: '100%', bgcolor: tokens.color.accent[500] }} />
				<Box
					aria-hidden='true'
					sx={{
						position: 'absolute',
						left: `${markerPct}%`,
						top: 0,
						width: '1px',
						height: '100%',
						bgcolor: tokens.color.accent[700]
					}}
				/>
			</Box>

			<Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mt: 1 }}>
				<BodySmall color='text.secondary'>{seats.used} actief</BodySmall>
				<BodySmall color='text.secondary' sx={{ textAlign: 'right' }}>
					{seats.included} zitplekken inbegrepen · {toReadableEuro(seats.overagePerSeatCents / 100)} per extra
					zitplek
				</BodySmall>
			</Box>

			{state === 'trialing' && (
				<BodySmall color='text.secondary' sx={{ mt: 1.5 }}>
					Tijdens de proefperiode kun je maximaal {seats.included} zitplekken gebruiken. Abonneer om voorbij{' '}
					{seats.included} zitplekken te groeien.
				</BodySmall>
			)}
		</Paper>
	);
}

function SeatStat({ value, label }: { value: number; label: string }) {
	const { tokens } = useTheme();
	return (
		<Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
			<Box component='span' sx={{ fontSize: 22, fontWeight: 'bold', color: tokens.color.ink1 }}>
				{value}
			</Box>
			<Box component='span' sx={{ fontSize: 14, color: tokens.color.ink3 }}>
				{label}
			</Box>
		</Box>
	);
}

function SeatSeparator({ children }: { children: string }) {
	const { tokens } = useTheme();
	return (
		<Box component='span' aria-hidden='true' sx={{ color: tokens.color.lineStrong, fontSize: 18 }}>
			{children}
		</Box>
	);
}

/* ===================== Invoices (MOCK) ===================== */

function NextInvoiceCard({ invoice }: { invoice: NextInvoice }) {
	const { tokens } = useTheme();
	return (
		<Paper variant='outlined' sx={{ p: 3 }}>
			<H2 component='h2' sx={{ fontSize: 18, mb: 1.5 }}>
				Volgende factuur
			</H2>
			<Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
				<BodySmall color='text.secondary'>{toReadableDate(invoice.dueDateIso, 'D MMM YYYY')}</BodySmall>
				<Box component='span' sx={{ fontSize: 22, fontWeight: 'bold', color: tokens.color.ink1 }}>
					{toReadableEuro(invoice.totalCents / 100)}
				</Box>
			</Box>
			<Divider />
			<Stack useFlexGap spacing={1} sx={{ mt: 1.5 }}>
				{invoice.lines.map(line => (
					<Box key={line.label} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
						<BodySmall>{line.label}</BodySmall>
						<BodySmall>{toReadableEuro(line.amountCents / 100)}</BodySmall>
					</Box>
				))}
			</Stack>
		</Paper>
	);
}

/* ===================== Not-entitled — upsell landing ===================== */

const BILLING_FEATURES: { icon: AppIconName; title: string; detail: string }[] = [
	{
		icon: 'sunrise',
		title: 'Dagelijks overzicht',
		detail: 'Elke ochtend je belangrijkste openstaande aanvragen, op volgorde van urgentie en waarde.'
	},
	{
		icon: 'alarm-clock',
		title: 'Slimme acties bij verloop',
		detail: 'Offertum stelt voor wat te doen vóór een offerte verloopt — verlengen, herinneren of afsluiten.'
	},
	{
		icon: 'trending-up',
		title: 'Inzicht in je winkans',
		detail: 'Zie hoe snel je reageert en hoeveel je daarmee wint, met patronen uit je eigen historie.'
	},
	{
		icon: 'sparkles',
		title: 'Automatische follow-ups',
		detail: 'Stille aanvragen krijgen een concept-vervolg in jouw schrijfstijl, klaar om te versturen.'
	}
];

/**
 * Where a member without an active subscription lands on /billing. Reads as a calm
 * "here's what a subscription unlocks", never an error. Owners get a "Start abonnement"
 * action; non-owners get the "ask the owner" line instead (the API blocks owner-only
 * actions, so non-owners can browse this page but never trigger a charge).
 */
function BillingUpsellLanding({ status, isOwner }: { status: BillingStatus; isOwner: boolean }) {
	const { tokens } = useTheme();
	const startCheckout = useStartCheckout();

	return (
		<Container maxWidth='sm' sx={{ py: 8 }}>
			<Stack useFlexGap spacing={3}>
				<PageHeader title='Abonnement' disableMargin />

				<Paper variant='outlined' sx={{ p: 0, overflow: 'hidden' }}>
					<Box sx={{ p: 4, borderBottom: `1px solid ${tokens.color.line}` }}>
						<Box
							sx={{
								width: 48,
								height: 48,
								borderRadius: `${tokens.radius.md}px`,
								bgcolor: tokens.color.accent[50],
								border: `1px solid ${tokens.color.accent[300]}`,
								color: tokens.color.accent[700],
								display: 'inline-flex',
								alignItems: 'center',
								justifyContent: 'center',
								mb: 2
							}}
						>
							<AppIcon name='lock' size='large' />
						</Box>

						<H2 component='h2' sx={{ fontSize: 24 }}>
							Ontgrendel Slimme prioritering
						</H2>
						<Body color='text.secondary' sx={{ mt: 1, maxWidth: 560 }}>
							Je gebruikt nu de basis van Offertum. Met een abonnement zet Offertum je belangrijkste
							aanvragen vooraan en handelt het de opvolging voor je af — zodat geen enkele offerte
							stilletjes verloopt.
						</Body>

						{startCheckout.isError && (
							<Banner tone='error' sx={{ mt: 2 }}>
								{startCheckout.error instanceof Error
									? startCheckout.error.message
									: 'Er ging iets mis. Probeer het opnieuw.'}
							</Banner>
						)}

						<Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5, mt: 3, flexWrap: 'wrap' }}>
							{isOwner ? (
								<Button
									variant='contained'
									size='large'
									startIcon={<AppIcon name='external-link' size='medium' />}
									onClick={() => startCheckout.mutate()}
									disabled={startCheckout.isPending}
								>
									{startCheckout.isPending ? 'Doorverwijzen...' : 'Start abonnement'}
								</Button>
							) : (
								<Stack direction='row' useFlexGap spacing={1} sx={{ alignItems: 'center' }}>
									<Box component='span' sx={{ color: tokens.color.ink4, display: 'inline-flex' }}>
										<AppIcon name='info' size='medium' />
									</Box>
									<BodySmall fontWeight='medium' color='text.primary'>
										Vraag de eigenaar van je organisatie om een abonnement.
									</BodySmall>
								</Stack>
							)}
							<Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75 }}>
								<Box
									component='span'
									sx={{ fontSize: 22, fontWeight: 'bold', color: tokens.color.ink1 }}
								>
									{toReadableEuro(status.seats.baseMonthlyPriceCents / 100)}
								</Box>
								<BodySmall color='text.secondary'>
									/maand · {status.seats.included} zitplekken inbegrepen
								</BodySmall>
							</Box>
						</Box>
					</Box>

					<Box
						sx={{
							p: 4,
							display: 'grid',
							gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
							gap: 2.5
						}}
					>
						{BILLING_FEATURES.map(feature => (
							<Stack
								key={feature.title}
								direction='row'
								useFlexGap
								spacing={1.5}
								sx={{ alignItems: 'flex-start' }}
							>
								<Box
									sx={{
										width: 32,
										height: 32,
										flexShrink: 0,
										borderRadius: `${tokens.radius.sm}px`,
										bgcolor: tokens.color.paper2,
										border: `1px solid ${tokens.color.line}`,
										color: tokens.color.accent[700],
										display: 'inline-flex',
										alignItems: 'center',
										justifyContent: 'center'
									}}
								>
									<AppIcon name={feature.icon} size='medium' />
								</Box>
								<Box sx={{ minWidth: 0 }}>
									<H3 component='h3' sx={{ fontSize: 14 }}>
										{feature.title}
									</H3>
									<BodySmall color='text.secondary' sx={{ mt: 0.25 }}>
										{feature.detail}
									</BodySmall>
								</Box>
							</Stack>
						))}
					</Box>
				</Paper>

				<Stack direction='row' useFlexGap spacing={1} sx={{ alignItems: 'center', justifyContent: 'center' }}>
					<Box component='span' sx={{ color: tokens.color.ink4, display: 'inline-flex' }}>
						<AppIcon name='shield-check' size='small' />
					</Box>
					<BodySmall color='text.secondary'>Maandelijks opzegbaar · 14 dagen gratis proberen</BodySmall>
				</Stack>
			</Stack>
		</Container>
	);
}

/* ===================== Helpers ===================== */

function stateChip(
	state: BillingStatus['state'],
	isPaymentProcessing: boolean
): {
	color: 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info';
	label: string;
} {
	switch (state) {
		case 'none':
			return { color: 'default', label: 'Geen abonnement' };
		case 'trialing':
			return { color: 'primary', label: 'Proefperiode' };
		case 'active':
			return { color: 'success', label: 'Actief' };
		case 'past_due':
			return isPaymentProcessing
				? { color: 'info', label: 'Betaling verwerken' }
				: { color: 'warning', label: 'Betaling mislukt' };
		case 'paused':
			return { color: 'warning', label: 'Gepauzeerd' };
		case 'canceled':
		case 'unpaid':
		case 'incomplete_expired':
			return { color: 'error', label: 'Inactief' };
		case 'incomplete':
			return { color: 'warning', label: 'Onvolledig' };
	}
}

function primaryLine(state: BillingStatus['state'], endDate: Date | null, isPaymentProcessing: boolean): string {
	switch (state) {
		case 'none':
			return 'Je bent je proefperiode nog niet gestart.';
		case 'trialing':
			return `Gratis proefperiode — eerste afschrijving op ${endDate ? toReadableDate(endDate, 'D MMM YYYY') : '-'}`;
		case 'active':
			return `Abonnement actief — verlengt op ${endDate ? toReadableDate(endDate, 'D MMM YYYY') : '-'}`;
		case 'past_due':
			return isPaymentProcessing
				? 'Betaling wordt verwerkt — bankincasso (SEPA) kan enkele dagen duren.'
				: 'We konden je laatste betaling niet innen.';
		case 'paused':
			return 'Abonnement gepauzeerd.';
		case 'canceled':
			return 'Abonnement opgezegd.';
		case 'unpaid':
			return 'Abonnement onbetaald.';
		case 'incomplete':
			return 'Abonnement-instelling onvolledig.';
		case 'incomplete_expired':
			return 'Abonnement-instelling verlopen.';
	}
}

function secondaryLine(state: BillingStatus['state'], isPaymentProcessing: boolean): string | null {
	switch (state) {
		case 'none':
			return 'Start je 14-daagse gratis proefperiode. Een kaart is vereist bij aanmelding, maar je wordt 14 dagen niet belast. Annuleer op elk moment daarvoor.';
		case 'past_due':
			return isPaymentProcessing
				? 'Geen actie nodig — we bevestigen zodra je bank de betaling afrondt.'
				: 'Werk je betaalmethode bij om je abonnement actief te houden.';
		case 'canceled':
			return 'Abonneer opnieuw om toegang te herstellen.';
		default:
			return null;
	}
}

function formatPaymentMethod(brand: string): string {
	if (brand === 'card') {
		return 'Kaart';
	}
	if (brand === 'sepa_debit') {
		return 'SEPA-incasso';
	}
	return brand.charAt(0).toUpperCase() + brand.slice(1);
}

const SUBSCRIBE_STATES: ReadonlyArray<BillingStatus['state']> = ['none', 'canceled', 'incomplete_expired', 'unpaid'];

function shouldShowSubscribe(status: BillingStatus): boolean {
	return SUBSCRIBE_STATES.includes(status.state);
}

// "Nu naar betaald upgraden" converts a trial to an active subscription early (ends the Stripe
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
		return 'Start je 14-daagse gratis proefperiode';
	}
	return 'Abonneren';
}

// For terminal states the Portal can only show invoice history (no active sub to manage),
// so the label changes to match. Everything else stays "Beheer abonnement".
function portalLabel(state: BillingStatus['state']): string {
	switch (state) {
		case 'canceled':
		case 'unpaid':
		case 'incomplete_expired':
			return 'Bekijk eerdere facturen';
		default:
			return 'Beheer abonnement';
	}
}

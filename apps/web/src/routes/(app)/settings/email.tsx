import { AppIcon } from '@/components/AppIcon.component';
import { Banner } from '@/components/Banner.component';
import { PageHeader } from '@/components/PageHeader.component';
import { SectionError } from '@/components/SectionError.component';
import { Body, BodySmall, Label } from '@/components/Text.component';
import { billingStatusQueryOptions } from '@/lib/queries/billing.queries';
import {
	gmailStatusQueryOptions,
	microsoftStatusQueryOptions,
	useDisconnectGmail,
	useDisconnectMicrosoft
} from '@/lib/queries/email.queries';
import { myMembershipQueryOptions } from '@/lib/queries/team.queries';
import { EmailSettingsSearchSchema } from '@/lib/schemas/email.schema';
import { toReadableDate } from '@/lib/utils/date.utils';
import { getEmailConnectErrorCopy } from '@/lib/utils/email-connect-error';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import IconButton from '@mui/material/IconButton';
import MuiLink from '@mui/material/Link';
import ListItemIcon from '@mui/material/ListItemIcon';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import { useTheme } from '@mui/material/styles';
import type { BillingState, EmailProvider, MailboxStatus } from '@offertum/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { toMailboxRows, type MailboxRowView } from './-email.mock';

export const Route = createFileRoute('/(app)/settings/email')({
	validateSearch: EmailSettingsSearchSchema,
	loader: ({ context }) =>
		Promise.all([
			context.queryClient.ensureQueryData(gmailStatusQueryOptions),
			context.queryClient.ensureQueryData(microsoftStatusQueryOptions),
			context.queryClient.ensureQueryData(billingStatusQueryOptions),
			context.queryClient.ensureQueryData(myMembershipQueryOptions)
		]),
	component: EmailSettingsPage,
	errorComponent: SectionError
});

function EmailSettingsPage() {
	const navigate = useNavigate();
	const search = Route.useSearch();
	const { data: gmailStatus } = useSuspenseQuery(gmailStatusQueryOptions);
	const { data: msStatus } = useSuspenseQuery(microsoftStatusQueryOptions);
	const { data: billing } = useSuspenseQuery(billingStatusQueryOptions);
	const { data: me } = useSuspenseQuery(myMembershipQueryOptions);

	// Mirror the API's EntitlementGuard set: connect/disconnect will 402 outside this set.
	const billingEntitled = billing.state === 'trialing' || billing.state === 'active' || billing.state === 'past_due';
	const isOwner = me.role === 'OWNER';

	// OAuth callback params (`connected=1`, `error=…`, `adminConsentUrl=…`) are one-shot
	// signals tied to the just-completed handshake. Capture them into local state on mount
	// so the success/error UI survives, then strip them from the URL so a refresh doesn't
	// keep the alerts visible. `replace: true` keeps the cleaned URL out of the browser history.
	const [oauthFeedback] = useState(() => ({
		connected: search.connected,
		error: search.error,
		adminConsentUrl: search.adminConsentUrl
	}));

	useEffect(() => {
		if (!search.connected && !search.error && !search.adminConsentUrl) {
			return;
		}

		void navigate({ to: '/settings/email', search: {}, replace: true });
		// Run once on mount only, we intentionally do NOT depend on `search` because the
		// effect's job is to clear the URL once, not to react to ongoing changes.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// `connected=1` only ever fires once per OAuth round-trip; we can't tell from the
	// URL which provider just connected, so the success Alert just says "connected"
	// and the user sees which section is now green.
	const showSuccessAlert = Boolean(oauthFeedback.connected === '1' && (gmailStatus.connected || msStatus.connected));

	return (
		<Stack>
			<PageHeader
				title='E-mailaccounts'
				caption='Verbind je Gmail- en Outlook-mailboxen zodat Offertum binnenkomende offerteaanvragen kan lezen en antwoorden namens jou kan versturen. Elke medewerker beheert zijn eigen koppelingen.'
			/>

			<Stack useFlexGap spacing={3}>
				{showSuccessAlert && (
					<Banner tone='success'>
						Mailbox verbonden. Offertum importeert op de achtergrond je laatste 90 dagen.
					</Banner>
				)}

				{oauthFeedback.error === 'microsoft_admin_consent_required' && oauthFeedback.adminConsentUrl ? (
					<AdminConsentAlert adminConsentUrl={oauthFeedback.adminConsentUrl} />
				) : (
					(() => {
						const copy = getEmailConnectErrorCopy(oauthFeedback.error);
						if (!copy) {
							return null;
						}

						return (
							<Banner tone='error' title={copy.title}>
								<BodySmall sx={{ mt: 0.5 }}>{copy.description}</BodySmall>
							</Banner>
						);
					})()
				)}

				{!billingEntitled && (
					<Banner
						tone='warning'
						action={
							isOwner ? (
								<Button color='inherit' size='small' onClick={() => navigate({ to: '/billing' })}>
									Abonneren
								</Button>
							) : undefined
						}
					>
						{billingBlockedCopy(billing.state, isOwner)}
					</Banner>
				)}

				<ProviderSection
					provider='GMAIL'
					label='Gmail'
					connectUrl='/api/email/gmail/connect'
					status={gmailStatus}
					billingEntitled={billingEntitled}
					useDisconnect={useDisconnectGmail}
				/>

				<ProviderSection
					provider='MICROSOFT'
					label='Outlook'
					connectUrl='/api/email/microsoft/connect'
					status={msStatus}
					billingEntitled={billingEntitled}
					useDisconnect={useDisconnectMicrosoft}
					disconnectNote={
						<>
							Gebruik <strong>Verbreken</strong> om onze toegang in te trekken — dat stopt Offertum met
							het lezen van je mailbox. Wil je Offertum ook uit de app-lijst van je Microsoft-account
							verwijderen, ga dan naar{' '}
							<MuiLink
								href='https://account.microsoft.com/privacy/app-access'
								target='_blank'
								rel='noopener noreferrer'
							>
								account.microsoft.com/privacy
							</MuiLink>{' '}
							— dit is optioneel en verbreekt de koppeling niet vanzelf.
						</>
					}
				/>
			</Stack>

			<BodySmall color='textSecondary' sx={{ display: 'block', mt: 5 }}>
				Offertum vraagt alleen lees- en verzendrechten aan. We lezen nooit berichten buiten je
				offerteaanvraag-flow, en de tokens worden versleuteld opgeslagen.
			</BodySmall>
		</Stack>
	);
}

interface ProviderSectionProps {
	provider: EmailProvider;
	label: string;
	connectUrl: string;
	status: MailboxStatus;
	billingEntitled: boolean;
	useDisconnect: () => { mutate: () => void; isPending: boolean };
	// Optional caption shown under the section. Used by the Outlook section to nudge users at
	// Entra's user-revoke page since Microsoft offers no programmatic revoke endpoint, clearing
	// the local row removes our access, but the grant itself lingers in the user's Microsoft
	// account until they delete it there.
	disconnectNote?: React.ReactNode;
}

/**
 * One provider section — a Card with a header row (provider mark + label + add-account
 * action) and the stacked mailbox rows beneath it. Owns its own connect/disconnect lifecycle.
 *
 * The backend models a single mailbox per provider, so `accounts` is 0 or 1 row today; the
 * design's multi-account layout is preserved so a future API change is a data swap, not a
 * rewrite (see `email.mock.ts`).
 */
function ProviderSection({
	provider,
	label,
	connectUrl,
	status,
	billingEntitled,
	useDisconnect,
	disconnectNote
}: ProviderSectionProps) {
	const { tokens } = useTheme();
	const disconnect = useDisconnect();
	const accounts = toMailboxRows(provider, status);
	const hasAccounts = accounts.length > 0;

	const handleConnect = () => {
		window.location.href = connectUrl;
	};

	return (
		<Card variant='outlined' sx={{ p: 0, overflow: 'hidden' }}>
			<Box
				sx={{
					p: 3,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					gap: 2,
					borderBottom: hasAccounts ? `1px solid ${tokens.color.line}` : 'none'
				}}
			>
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
					<ProviderMark provider={provider} />
					<Label fontWeight='bold' sx={{ fontSize: 16 }}>
						{label}
					</Label>
				</Box>
				<Button
					variant={hasAccounts ? 'outlined' : 'contained'}
					startIcon={<AppIcon name='plus' size='medium' />}
					onClick={handleConnect}
					disabled={!billingEntitled}
				>
					{hasAccounts ? 'Voeg account toe' : `Verbind ${label}-account`}
				</Button>
			</Box>

			{hasAccounts && (
				<Box>
					{accounts.map((account, index) => (
						<MailboxRow
							key={account.id}
							mailbox={account}
							isLast={index === accounts.length - 1}
							billingEntitled={billingEntitled}
							isDisconnecting={disconnect.isPending}
							onReconnect={handleConnect}
							onDisconnect={() => disconnect.mutate()}
						/>
					))}
				</Box>
			)}

			{disconnectNote && hasAccounts && (
				<Box sx={{ px: 3, pb: 3 }}>
					<BodySmall color='textSecondary'>{disconnectNote}</BodySmall>
				</Box>
			)}
		</Card>
	);
}

interface MailboxRowProps {
	mailbox: MailboxRowView;
	isLast: boolean;
	billingEntitled: boolean;
	isDisconnecting: boolean;
	onReconnect: () => void;
	onDisconnect: () => void;
}

/**
 * One connected mailbox row: provider mark, address, status badge, sync metadata, and a kebab
 * menu (Opnieuw verbinden / Verbreken). The degraded "Verbroken" badge + error Alert render
 * when the row view-model carries `status: 'disconnected'` / `error`; the real API never
 * produces that state today (see `email.mock.ts`).
 */
function MailboxRow({ mailbox, isLast, billingEntitled, isDisconnecting, onReconnect, onDisconnect }: MailboxRowProps) {
	const { tokens } = useTheme();
	const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
	const isMenuOpen = Boolean(menuAnchor);
	const isConnected = mailbox.status === 'connected';

	const closeMenu = () => setMenuAnchor(null);

	return (
		<Box
			sx={{
				p: 3,
				borderBottom: isLast ? 'none' : `1px solid ${tokens.color.line}`,
				display: 'flex',
				flexDirection: 'column',
				gap: 1.5
			}}
		>
			<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.75 }}>
				<ProviderMark provider={mailbox.provider} size={28} />
				<Box sx={{ flex: 1, minWidth: 0 }}>
					<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
						<Body fontWeight='medium' sx={{ wordBreak: 'break-all' }}>
							{mailbox.email}
						</Body>
						<StatusBadge connected={isConnected} />
					</Box>
					<BodySmall color='textSecondary' sx={{ display: 'block', mt: 0.25 }}>
						{mailbox.connectedAt
							? `Verbonden op ${toReadableDate(mailbox.connectedAt, 'D MMM YYYY')} · Laatste sync ${mailbox.lastSync}`
							: `Laatste sync ${mailbox.lastSync}`}
					</BodySmall>
				</Box>
				<IconButton
					aria-label='Acties voor mailbox'
					aria-haspopup='menu'
					aria-expanded={isMenuOpen}
					size='small'
					onClick={event => setMenuAnchor(event.currentTarget)}
				>
					<AppIcon name='dots-vertical' size='medium' />
				</IconButton>
				<Menu anchorEl={menuAnchor} open={isMenuOpen} onClose={closeMenu}>
					<MenuItem
						disabled={!billingEntitled}
						onClick={() => {
							closeMenu();
							onReconnect();
						}}
					>
						<ListItemIcon>
							<AppIcon name='refresh' size='medium' />
						</ListItemIcon>
						Opnieuw verbinden
					</MenuItem>
					<MenuItem
						disabled={!billingEntitled || isDisconnecting}
						sx={{ color: 'error.main' }}
						onClick={() => {
							closeMenu();
							onDisconnect();
						}}
					>
						<ListItemIcon>
							<AppIcon name='unlink' size='medium' style={{ color: tokens.color.lost[500] }} />
						</ListItemIcon>
						{isDisconnecting ? 'Verbreken…' : 'Verbreken'}
					</MenuItem>
				</Menu>
			</Box>

			{mailbox.error && (
				<Banner
					tone='warning'
					action={
						<Button
							size='small'
							color='inherit'
							startIcon={<AppIcon name='refresh' size='small' />}
							onClick={onReconnect}
						>
							Opnieuw verbinden
						</Button>
					}
				>
					{mailbox.error}
				</Banner>
			)}
		</Box>
	);
}

/**
 * Connected / disconnected pill. Mirrors the design's bordered dot-prefixed badge using theme
 * tokens (accent for connected, neutral ink for the degraded "Verbroken" state).
 */
function StatusBadge({ connected }: { connected: boolean }) {
	const { tokens } = useTheme();
	const color = connected ? tokens.color.accent[700] : tokens.color.ink4;
	const borderColor = connected ? tokens.color.accent[500] : tokens.color.lineStrong;
	const dotColor = connected ? tokens.color.accent[500] : tokens.color.ink4;

	return (
		<Box
			component='span'
			sx={{
				display: 'inline-flex',
				alignItems: 'center',
				gap: 0.75,
				px: 1,
				py: 0.25,
				border: `1px solid ${borderColor}`,
				borderRadius: `${tokens.radius.sm}px`,
				color,
				fontSize: 11,
				fontWeight: 'medium',
				lineHeight: 1.6
			}}
		>
			<Box component='span' sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: dotColor }} />
			{connected ? 'Verbonden' : 'Verbroken'}
		</Box>
	);
}

/**
 * Provider logo placeholder block. The design uses simple wordmark blocks (a single letter),
 * not the real Gmail/Outlook logos — kept as a placeholder until real brand marks are added.
 */
function ProviderMark({ provider, size = 36 }: { provider: EmailProvider; size?: number }) {
	const { tokens } = useTheme();
	const glyph = provider === 'GMAIL' ? 'G' : 'O';

	return (
		<Box
			component='span'
			aria-hidden='true'
			sx={{
				width: size,
				height: size,
				flexShrink: 0,
				borderRadius: `${tokens.radius.md}px`,
				bgcolor: tokens.color.paper2,
				border: `1px solid ${tokens.color.line}`,
				display: 'inline-flex',
				alignItems: 'center',
				justifyContent: 'center',
				color: tokens.color.ink1,
				fontFamily: tokens.font.sans,
				fontWeight: 700,
				fontSize: Math.round(size * 0.45)
			}}
		>
			{glyph}
		</Box>
	);
}

/**
 * Surfaced when a user in a work tenant tries to connect Microsoft and Entra rejects the
 * request because their admin has disabled user-level consent for Mail.* scopes. The user
 * can't fix this themselves, their IT admin has to approve the app once for the whole
 * tenant. We provide a copyable link they can forward to that admin.
 */
function AdminConsentAlert({ adminConsentUrl }: { adminConsentUrl: string }) {
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(adminConsentUrl);
			setCopied(true);
			setTimeout(() => setCopied(false), 2500);
		} catch {
			// Clipboard API can fail in older browsers / non-secure contexts; the link is
			// visible in the Alert so the user can copy it manually as a fallback.
			setCopied(false);
		}
	};

	return (
		<Banner tone='warning'>
			<BodySmall fontWeight='bold' sx={{ mb: 1 }}>
				Je IT-beheerder moet Offertum goedkeuren voor je organisatie.
			</BodySmall>
			<BodySmall sx={{ display: 'block', mb: 2 }}>
				Microsoft vereist een eenmalige goedkeuring door een beheerder voordat iemand in je bedrijf zijn mailbox
				kan verbinden. Stuur deze link door naar je IT-beheerder — zodra die goedkeurt, kunnen jij en je
				collega's je Outlook-mailboxen normaal verbinden.
			</BodySmall>
			<Box
				sx={{
					p: 1.25,
					mb: 1.5,
					bgcolor: 'background.default',
					border: 1,
					borderColor: 'divider',
					borderRadius: 1,
					wordBreak: 'break-all',
					fontFamily: 'monospace',
					fontSize: 12
				}}
			>
				{adminConsentUrl}
			</Box>
			<Button size='small' variant='outlined' color='inherit' onClick={handleCopy}>
				{copied ? 'Gekopieerd!' : 'Kopieer link'}
			</Button>
		</Banner>
	);
}

function billingBlockedCopy(state: BillingState, isOwner: boolean): string {
	const ownerSuffix = isOwner ? 'Abonneer je om een mailbox te verbinden.' : 'Vraag je eigenaar om te abonneren.';
	switch (state) {
		case 'none':
			return `Je hebt je proefperiode nog niet gestart. ${ownerSuffix}`;
		case 'canceled':
			return `Je abonnement is geannuleerd. ${ownerSuffix}`;
		case 'unpaid':
			return `Je abonnement is onbetaald, werk eerst je betaalmethode bij. ${ownerSuffix}`;
		case 'paused':
			return `Je abonnement is gepauzeerd. ${isOwner ? 'Hervat het om een mailbox te verbinden.' : 'Vraag je eigenaar om het abonnement te hervatten.'}`;
		case 'incomplete':
			return `De abonnement-setup is niet voltooid. ${isOwner ? 'Rond de checkout af om een mailbox te verbinden.' : 'Vraag je eigenaar om de checkout af te ronden.'}`;
		case 'incomplete_expired':
			return `De abonnement-setup is verlopen. ${ownerSuffix}`;
		default:
			return `Je abonnement is inactief. ${ownerSuffix}`;
	}
}

import { AppIcon } from '@/components/AppIcon.component';
import { Banner } from '@/components/Banner.component';
import { PageHeader } from '@/components/PageHeader.component';
import { SectionError } from '@/components/SectionError.component';
import { SubscribeCta } from '@/components/SubscribeCta.component';
import { Body, BodySmall, H3, Label, Overline } from '@/components/Text.component';
import { LockGlyph } from '@/components/UpsellTeaser.component';
import { billingStatusQueryOptions, isBillingEntitled } from '@/lib/queries/billing.queries';
import { myMembershipQueryOptions } from '@/lib/queries/team.queries';
import { toReadableNumber } from '@/lib/utils/number.utils';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import { useTheme } from '@mui/material/styles';
import { pluralize } from '@offertum/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { MOCK_INTEGRATIONS, type Integration } from './-integrations.mock';

/**
 * Settings → Integraties. A FUTURE-POSSIBILITIES DEMO ported from the Claude Design project:
 * third-party accounting/ERP connectors (Moneybird / NetSuite / Celigo). There is no
 * integrations backend yet, so all data here is static and the connect/sync controls are
 * inert — the page exists to show the intended shape (and the subscription upsell) once a
 * real `integrations` API lands. See the `design-integrations-page-unbacked` memory.
 *
 * All connector fixture data lives in the clearly-separated `./integrations.mock` module
 * (typed `MOCK_INTEGRATIONS`) so it can be swapped for query/mutation hooks once a backend
 * is scoped — see that file's header for the mock assumptions.
 */
export const Route = createFileRoute('/(app)/settings/integrations')({
	loader: ({ context }) =>
		Promise.all([
			context.queryClient.ensureQueryData(billingStatusQueryOptions),
			context.queryClient.ensureQueryData(myMembershipQueryOptions)
		]),
	component: IntegrationsSettingsPage,
	errorComponent: SectionError
});

function IntegrationsSettingsPage() {
	const { data: billing } = useSuspenseQuery(billingStatusQueryOptions);
	const { data: me } = useSuspenseQuery(myMembershipQueryOptions);
	const isEntitled = isBillingEntitled(billing.state);
	const isOwner = me.role === 'OWNER';

	if (!isEntitled) {
		return <IntegrationsUpsell isOwner={isOwner} />;
	}

	return (
		<Stack useFlexGap spacing={3}>
			<PageHeader
				title='Integraties'
				caption='Verbind Offertum met je boekhouding, ERP of integratieplatform. Offertes, klanten en orders blijven dan automatisch in sync — geen kopiëren-en-plakken meer.'
				disableMargin
			/>

			<Banner tone='info' icon='info'>
				Demo — dit laat zien wat straks mogelijk is. De koppelingen hieronder zijn nog niet actief.
			</Banner>

			<IntegrationSummary />

			<Stack useFlexGap spacing={2}>
				{MOCK_INTEGRATIONS.map(integration => (
					<IntegrationCard key={integration.id} integration={integration} />
				))}
			</Stack>
		</Stack>
	);
}

const UPSELL_BULLETS = [
	'Gewonnen offerte → automatisch concept-factuur in je boekhouding',
	'Klantcontacten tweezijdig gesynchroniseerd',
	'Koppel ERP of een integratieplatform voor maatwerk-workflows'
] as const;

function IntegrationsUpsell({ isOwner }: { isOwner: boolean }) {
	const { tokens } = useTheme();
	return (
		<Stack useFlexGap spacing={3}>
			<PageHeader title='Integraties' caption='Verbind Offertum met je boekhouding, ERP of integratieplatform.' />

			<Card sx={{ p: 3 }}>
				<Stack useFlexGap spacing={2}>
					<Stack direction='row' useFlexGap spacing={1} sx={{ alignItems: 'center' }}>
						<LockGlyph />
						<H3 component='h2'>Koppel je boekhouding en meer</H3>
					</Stack>
					<BodySmall color='textSecondary'>Met een abonnement krijg je:</BodySmall>
					<Stack useFlexGap spacing={0.5}>
						{UPSELL_BULLETS.map(bullet => (
							<Stack
								key={bullet}
								direction='row'
								useFlexGap
								spacing={1}
								sx={{ alignItems: 'flex-start' }}
							>
								<AppIcon
									name='check'
									size='medium'
									style={{ color: tokens.color.accent[500], marginTop: 2 }}
								/>
								<BodySmall>{bullet}</BodySmall>
							</Stack>
						))}
					</Stack>
					<SubscribeCta
						isOwner={isOwner}
						askOwnerText='Vraag de eigenaar van je organisatie om een abonnement.'
					/>
				</Stack>
			</Card>
		</Stack>
	);
}

function IntegrationSummary() {
	const { tokens } = useTheme();
	const connected = MOCK_INTEGRATIONS.filter(i => i.status === 'connected');
	if (connected.length === 0) {
		return null;
	}
	const totalSynced = connected.reduce((n, i) => n + (i.invoicesThisMonth ?? 0), 0);

	return (
		<Card sx={{ p: 2, backgroundColor: tokens.color.surfaceSunk }}>
			<Stack direction='row' useFlexGap spacing={1.75} sx={{ alignItems: 'center' }}>
				<Box
					sx={{
						width: 32,
						height: 32,
						borderRadius: `${tokens.radius.md}px`,
						backgroundColor: tokens.color.accent[50],
						color: tokens.color.accent[700],
						display: 'inline-flex',
						alignItems: 'center',
						justifyContent: 'center',
						flexShrink: 0
					}}
				>
					<AppIcon name='link' size='medium' />
				</Box>
				<Box sx={{ flex: 1, minWidth: 0 }}>
					<Body fontWeight='medium'>
						{connected.length} {pluralize(connected.length, 'actieve verbinding', 'actieve verbindingen')}
					</Body>
					<BodySmall color='textSecondary'>
						{toReadableNumber(totalSynced)} concept-facturen aangemaakt deze maand · alle koppelingen
						draaien
					</BodySmall>
				</Box>
				<StatusPill tone='won' label='Alles in orde' />
			</Stack>
		</Card>
	);
}

function IntegrationCard({ integration }: { integration: Integration }) {
	return integration.status === 'connected' ? (
		<ConnectedCard integration={integration} />
	) : (
		<AvailableCard integration={integration} />
	);
}

function ConnectedCard({ integration }: { integration: Integration }) {
	const { tokens } = useTheme();
	const [expanded, setExpanded] = useState(false);
	const [toggles, setToggles] = useState<Record<string, boolean>>(() =>
		Object.fromEntries((integration.settings ?? []).map(s => [s.id, s.on]))
	);

	return (
		<Card sx={{ p: 0, overflow: 'hidden' }}>
			<Box sx={{ p: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
				<IntegrationMark integration={integration} size={44} />
				<Box sx={{ flex: 1, minWidth: 0 }}>
					<Stack direction='row' useFlexGap spacing={1.25} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
						<Label sx={{ fontSize: '1rem' }}>{integration.name}</Label>
						<StatusPill tone='accent' label='Verbonden' />
						<CategoryChip integration={integration} />
					</Stack>
					<BodySmall color='textSecondary' sx={{ mt: 0.5 }}>
						<Box component='span' sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mr: 1 }}>
							<AppIcon
								name={integration.lastSyncOk ? 'circle-check' : 'alert-circle'}
								size='small'
								filled={integration.lastSyncOk}
								style={{
									color: integration.lastSyncOk ? tokens.color.won[500] : tokens.color.pending[500]
								}}
							/>
							Laatste sync {integration.lastSync}
						</Box>
						· Verbonden op {integration.connectedAt}
					</BodySmall>
				</Box>
				<Button
					variant='text'
					color='inherit'
					size='small'
					onClick={() => setExpanded(v => !v)}
					startIcon={<AppIcon name={expanded ? 'chevron-up' : 'settings'} size='medium' />}
				>
					{expanded ? 'Inklappen' : 'Beheren'}
				</Button>
			</Box>

			<Box
				sx={{
					px: 3,
					py: 2,
					backgroundColor: tokens.color.paper2,
					borderTop: `1px solid ${tokens.color.line}`,
					display: 'grid',
					gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1.4fr) auto auto' },
					gap: 3,
					alignItems: 'center'
				}}
			>
				<BodySmall color='textSecondary'>{integration.description}</BodySmall>
				<Metric value={integration.invoicesThisMonth ?? 0} label='Concept-facturen — deze maand' />
				<Metric value={integration.contactsSynced ?? 0} label='Contacten gesynchroniseerd' />
			</Box>

			{expanded && (
				<Box sx={{ borderTop: `1px solid ${tokens.color.line}` }}>
					<Box sx={{ px: 3, py: 2 }}>
						<Overline color='textSecondary' sx={{ display: 'block', mb: 1 }}>
							Verbonden account
						</Overline>
						<Stack
							direction='row'
							useFlexGap
							spacing={1.5}
							sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}
						>
							<Stack direction='row' useFlexGap spacing={1.5} sx={{ alignItems: 'center', minWidth: 0 }}>
								<AccountAvatar name={integration.connectedAccountName ?? integration.name} />
								<Box sx={{ minWidth: 0 }}>
									{integration.connectedAccountName && (
										<Body fontWeight='medium'>{integration.connectedAccountName}</Body>
									)}
									<BodySmall color='textSecondary'>{integration.connectedAs}</BodySmall>
								</Box>
							</Stack>
							<Button
								variant='outlined'
								size='small'
								startIcon={<AppIcon name='refresh' size='medium' />}
							>
								Opnieuw verbinden
							</Button>
						</Stack>
					</Box>
					<Box sx={{ px: 3, py: 2, borderTop: `1px solid ${tokens.color.line}` }}>
						<Overline color='textSecondary' sx={{ display: 'block', mb: 1 }}>
							Wat synchroniseren
						</Overline>
						<Stack useFlexGap spacing={0}>
							{(integration.settings ?? []).map((setting, index) => (
								<Stack
									key={setting.id}
									direction='row'
									useFlexGap
									spacing={2}
									sx={{
										alignItems: 'center',
										justifyContent: 'space-between',
										py: 1.25,
										borderTop: index === 0 ? 'none' : `1px solid ${tokens.color.line}`
									}}
								>
									<BodySmall sx={{ flex: 1 }}>{setting.label}</BodySmall>
									<Switch
										size='small'
										checked={toggles[setting.id] ?? false}
										onChange={e => setToggles(p => ({ ...p, [setting.id]: e.target.checked }))}
									/>
								</Stack>
							))}
						</Stack>
					</Box>
					<Box
						sx={{
							px: 3,
							py: 1.5,
							borderTop: `1px solid ${tokens.color.line}`,
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'space-between',
							flexWrap: 'wrap',
							gap: 1
						}}
					>
						<Button
							component='a'
							href={integration.externalUrl}
							target='_blank'
							rel='noopener noreferrer'
							variant='text'
							color='inherit'
							size='small'
							startIcon={<AppIcon name='external-link' size='medium' />}
						>
							Open in {integration.name}
						</Button>
						<Stack direction='row' useFlexGap spacing={1} sx={{ alignItems: 'center' }}>
							<Button
								variant='outlined'
								color='error'
								size='small'
								startIcon={<AppIcon name='unlink' size='medium' />}
							>
								Verbinding verbreken
							</Button>
							<Button variant='contained' size='small' startIcon={<AppIcon name='check' size='medium' />}>
								Wijzigingen opslaan
							</Button>
						</Stack>
					</Box>
				</Box>
			)}
		</Card>
	);
}

function AvailableCard({ integration }: { integration: Integration }) {
	const { tokens } = useTheme();
	const isBeta = integration.status === 'beta';

	return (
		<Card sx={{ p: 0, overflow: 'hidden' }}>
			<Box sx={{ p: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
				<IntegrationMark integration={integration} size={44} />
				<Box sx={{ flex: 1, minWidth: 0 }}>
					<Stack direction='row' useFlexGap spacing={1.25} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
						<Label sx={{ fontSize: '1rem' }}>{integration.name}</Label>
						{isBeta && <StatusPill tone='pending' label='Bèta' />}
						<CategoryChip integration={integration} />
					</Stack>
					<BodySmall color='textSecondary' sx={{ mt: 0.75, maxWidth: 540 }}>
						{integration.description}
					</BodySmall>
				</Box>
				<Stack useFlexGap spacing={0.75} sx={{ alignItems: 'flex-end', flexShrink: 0 }}>
					<Button
						variant='contained'
						size='small'
						startIcon={<AppIcon name={isBeta ? 'flask' : 'plug'} size='medium' />}
					>
						{isBeta ? 'Vraag toegang aan' : `Verbind ${integration.name}`}
					</Button>
					{integration.setupTimeMinutes && (
						<BodySmall color='text.disabled'>Installatie ≈ {integration.setupTimeMinutes} min</BodySmall>
					)}
					{isBeta && <BodySmall color='text.disabled'>Beperkte plekken</BodySmall>}
				</Stack>
			</Box>

			<Box
				sx={{
					px: 3,
					py: 1.75,
					backgroundColor: tokens.color.paper2,
					borderTop: `1px solid ${tokens.color.line}`,
					display: 'flex',
					flexWrap: 'wrap',
					gap: 2.25
				}}
			>
				{(integration.capabilities ?? []).map(capability => (
					<Stack key={capability} direction='row' useFlexGap spacing={1} sx={{ alignItems: 'center' }}>
						<AppIcon name='check' size='small' style={{ color: tokens.color.accent[500] }} />
						<BodySmall>{capability}</BodySmall>
					</Stack>
				))}
			</Box>

			{integration.requires && (
				<Box
					sx={{
						px: 3,
						py: 1.25,
						borderTop: `1px solid ${tokens.color.line}`,
						display: 'flex',
						alignItems: 'center',
						gap: 0.75
					}}
				>
					<AppIcon name='info' size='small' style={{ color: tokens.color.ink4 }} />
					<BodySmall color='text.disabled'>Vereist: {integration.requires}</BodySmall>
				</Box>
			)}
		</Card>
	);
}

function IntegrationMark({ integration, size }: { integration: Integration; size: number }) {
	return (
		<Box
			title={integration.name}
			sx={{
				width: size,
				height: size,
				borderRadius: '8px',
				backgroundColor: integration.accent,
				color: '#fff',
				display: 'inline-flex',
				alignItems: 'center',
				justifyContent: 'center',
				fontWeight: 'bold',
				fontSize: Math.round(size * 0.42),
				letterSpacing: '-0.02em',
				flexShrink: 0
			}}
		>
			{integration.name.charAt(0)}
		</Box>
	);
}

function AccountAvatar({ name }: { name: string }) {
	const { tokens } = useTheme();
	const initials = name
		.split(' ')
		.map(part => part[0])
		.filter(Boolean)
		.slice(0, 2)
		.join('')
		.toUpperCase();

	return (
		<Box
			sx={{
				width: 32,
				height: 32,
				borderRadius: `${tokens.radius.md}px`,
				backgroundColor: tokens.color.paper3,
				color: tokens.color.ink2,
				display: 'inline-flex',
				alignItems: 'center',
				justifyContent: 'center',
				fontWeight: 'bold',
				fontSize: 12,
				flexShrink: 0
			}}
		>
			{initials || '—'}
		</Box>
	);
}

function CategoryChip({ integration }: { integration: Integration }) {
	return (
		<BodySmall color='textSecondary'>
			{integration.category} · {integration.region}
		</BodySmall>
	);
}

function StatusPill({ tone, label }: { tone: 'accent' | 'won' | 'pending'; label: string }) {
	const { tokens } = useTheme();
	const palette = {
		accent: { border: tokens.color.accent[500], fg: tokens.color.accent[700], dot: tokens.color.accent[500] },
		won: { border: tokens.color.won[500], fg: tokens.color.won[700], dot: tokens.color.won[500] },
		pending: { border: tokens.color.pending[500], fg: tokens.color.pending[700], dot: tokens.color.pending[500] }
	}[tone];

	return (
		<Box
			component='span'
			sx={{
				display: 'inline-flex',
				alignItems: 'center',
				gap: 0.75,
				px: 1,
				py: 0.25,
				border: `1px solid ${palette.border}`,
				color: palette.fg,
				fontSize: 11,
				fontWeight: 'medium',
				borderRadius: `${tokens.radius.sm}px`,
				whiteSpace: 'nowrap'
			}}
		>
			<Box component='span' sx={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: palette.dot }} />
			{label}
		</Box>
	);
}

function Metric({ value, label }: { value: number; label: string }) {
	const { tokens } = useTheme();
	return (
		<Box sx={{ textAlign: { xs: 'left', sm: 'right' }, minWidth: 100 }}>
			<Box
				sx={{
					fontFamily: tokens.font.display,
					fontWeight: 'bold',
					fontSize: 22,
					lineHeight: 1,
					color: tokens.color.ink1,
					letterSpacing: '-0.01em'
				}}
			>
				{toReadableNumber(value)}
			</Box>
			<BodySmall color='textSecondary' sx={{ mt: 0.5 }}>
				{label}
			</BodySmall>
		</Box>
	);
}

import { AppIcon } from '@/components/AppIcon.component';
import { Banner } from '@/components/Banner.component';
import { Form } from '@/components/Form/Form.component';
import { StandaloneSwitch, Switch } from '@/components/Form/Switch/Switch.component';
import { PageHeader } from '@/components/PageHeader.component';
import { SectionError } from '@/components/SectionError.component';
import { Body, BodySmall, H3 } from '@/components/Text.component';
import { sessionQueryOptions } from '@/lib/queries/auth.queries';
import {
	notificationPreferencesQueryOptions,
	useUpdateNotificationPreferences
} from '@/lib/queries/notifications.queries';
import {
	NotificationPreferencesSchema,
	preferenceKey,
	type NotificationPreferencesForm
} from '@/lib/schemas/notification-preferences.schema';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import { useTheme } from '@mui/material/styles';
import {
	NOTIFICATION_CHANNELS,
	NOTIFICATION_EVENT_TYPES,
	defaultNotificationPreference,
	isEmailChannelAvailable,
	type NotificationChannel,
	type NotificationEventType,
	type UpdateNotificationPreferencesInput
} from '@offertum/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';

// Per-event copy for the in-app rows. The matrix is the source of truth for which
// events exist; this only provides Dutch presentation labels.
const EVENT_LABELS_NL: Record<NotificationEventType, { title: string; description: string }> = {
	opportunity_created: {
		title: 'Nieuwe offerteaanvraag',
		description: 'Een nieuwe aanvraag is binnengekomen in een verbonden mailbox.'
	},
	customer_reply: {
		title: 'Reactie van klant',
		description: 'Een klant heeft gereageerd op een lopende offerteaanvraag.'
	},
	opportunity_auto_cold: {
		title: 'Aanvraag automatisch koud gezet',
		description: 'Een offerteaanvraag is na de stilteperiode automatisch op Koud gezet.'
	},
	weekly_digest: {
		title: 'Wekelijks overzicht',
		description: 'Maandagochtend 08:00, samenvatting van open + koude offerteaanvragen.'
	},
	daily_digest: {
		title: 'Dagelijks overzicht',
		description: 'Elke ochtend 07:30, je belangrijkste aanvragen + offertes die binnenkort verlopen.'
	}
};

// Events whose email channel the backend exposes (auto_cold, weekly_digest,
// daily_digest). Derived once so the email card iterates only over real toggles.
const EMAIL_EVENTS = NOTIFICATION_EVENT_TYPES.filter(isEmailChannelAvailable);

export const Route = createFileRoute('/(app)/settings/notifications')({
	loader: ({ context }) =>
		Promise.all([
			context.queryClient.ensureQueryData(notificationPreferencesQueryOptions),
			context.queryClient.ensureQueryData(sessionQueryOptions)
		]),
	component: NotificationsSettingsPage,
	errorComponent: SectionError
});

function buildDefaults(
	preferences: ReadonlyArray<{ eventType: NotificationEventType; channel: NotificationChannel; enabled: boolean }>
): NotificationPreferencesForm {
	// Index the stored preferences once (O(1) lookups) instead of a `.find` per cell.
	const storedByKey = new Map<string, boolean>();
	for (const p of preferences) {
		storedByKey.set(preferenceKey(p.eventType, p.channel), p.enabled);
	}

	const map: NotificationPreferencesForm = {};
	for (const event of NOTIFICATION_EVENT_TYPES) {
		for (const channel of NOTIFICATION_CHANNELS) {
			if (channel === 'email' && !isEmailChannelAvailable(event)) {
				continue;
			}
			const key = preferenceKey(event, channel);
			map[key] = storedByKey.get(key) ?? defaultNotificationPreference(event, channel);
		}
	}
	return map;
}

function NotificationsSettingsPage() {
	const { data: prefs } = useSuspenseQuery(notificationPreferencesQueryOptions);
	const { data: session } = useSuspenseQuery(sessionQueryOptions);
	const update = useUpdateNotificationPreferences();
	const [savedFlash, setSavedFlash] = useState(false);

	const onSubmit = (values: NotificationPreferencesForm) => {
		const input: UpdateNotificationPreferencesInput = {
			preferences: NOTIFICATION_EVENT_TYPES.flatMap(event =>
				// Single pass: flatMap emits the row or drops it, instead of filter().map().
				NOTIFICATION_CHANNELS.flatMap(channel =>
					channel === 'email' && !isEmailChannelAvailable(event)
						? []
						: [
								{
									eventType: event,
									channel,
									enabled: values[preferenceKey(event, channel)] === true
								}
							]
				)
			)
		};
		update.mutate(input, {
			onSuccess: () => {
				setSavedFlash(true);
				window.setTimeout(() => setSavedFlash(false), 2500);
			}
		});
	};

	const accountEmail = session?.user?.email ?? null;

	return (
		<Stack>
			<PageHeader
				title='Notificaties'
				caption='Bepaal hoe en wanneer Offertum je laat weten dat er iets gebeurt. Voorkeuren gelden alleen voor jouw account. Notificaties zijn alleen informatief, niets wordt automatisch verstuurd of geaccepteerd.'
			/>

			<Form<NotificationPreferencesForm>
				action={onSubmit}
				schema={NotificationPreferencesSchema}
				defaultValues={buildDefaults(prefs.preferences)}
			>
				<Stack useFlexGap spacing={4}>
					<EmailNotificationsCard accountEmail={accountEmail} />
					<InAppNotificationsCard />

					{update.error && (
						<Banner tone='error'>
							{update.error instanceof Error ? update.error.message : 'Opslaan mislukt.'}
						</Banner>
					)}
					{savedFlash && <Banner tone='success'>Voorkeuren opgeslagen.</Banner>}

					<SaveBar isSaving={update.isPending} />
				</Stack>
			</Form>
		</Stack>
	);
}

interface SectionCardProps {
	title: string;
	caption: React.ReactNode;
	children: React.ReactNode;
}

// A titled card matching the design's per-section layout (header band + body rows).
function SectionCard({ title, caption, children }: SectionCardProps) {
	const { tokens } = useTheme();
	return (
		<Paper variant='outlined' sx={{ borderRadius: 2, overflow: 'hidden' }}>
			<Box sx={{ p: 4, borderBottom: `1px solid ${tokens.color.line}` }}>
				<H3 sx={{ display: 'block' }}>{title}</H3>
				<BodySmall color='textSecondary' sx={{ display: 'block' }}>
					{caption}
				</BodySmall>
			</Box>
			{children}
		</Paper>
	);
}

interface NotifRowProps {
	title: string;
	switchSlot: React.ReactNode;
	description?: string;
	lockedReason?: string;
	isLast?: boolean;
}

// One preference row: title + optional description on the left, a switch on the right.
function NotifRow({ title, description, switchSlot, lockedReason, isLast }: NotifRowProps) {
	const { tokens } = useTheme();
	return (
		<Stack
			direction='row'
			useFlexGap
			spacing={2}
			sx={{
				p: 4,
				alignItems: 'center',
				justifyContent: 'space-between',
				borderBottom: isLast ? 'none' : `1px solid ${tokens.color.line}`
			}}
		>
			<Box sx={{ flex: 1, minWidth: 0 }}>
				<Body fontWeight='medium' sx={{ display: 'block' }}>
					{title}
				</Body>
				{description && (
					<BodySmall color='textSecondary' sx={{ display: 'block' }}>
						{description}
					</BodySmall>
				)}
				{lockedReason && (
					<Stack
						direction='row'
						useFlexGap
						spacing={0.5}
						sx={{ alignItems: 'center', mt: 1, color: 'error.main' }}
					>
						<AppIcon name='lock' size='small' />
						<BodySmall>{lockedReason}</BodySmall>
					</Stack>
				)}
			</Box>
			<Box sx={{ flexShrink: 0 }}>{switchSlot}</Box>
		</Stack>
	);
}

interface EmailNotificationsCardProps {
	accountEmail: string | null;
}

function EmailNotificationsCard({ accountEmail }: EmailNotificationsCardProps) {
	return (
		<SectionCard
			title='E-mail meldingen'
			caption={
				accountEmail ? (
					<>
						Verstuurd naar{' '}
						<Box component='span' sx={{ color: 'text.primary', fontWeight: 'medium' }}>
							{accountEmail}
						</Box>
						.
					</>
				) : (
					'Verstuurd naar het e-mailadres van je account.'
				)
			}
		>
			{EMAIL_EVENTS.map(event => (
				<NotifRow
					key={event}
					title={EVENT_LABELS_NL[event].title}
					description={EVENT_LABELS_NL[event].description}
					switchSlot={
						<Switch
							name={preferenceKey(event, 'email')}
							slotProps={{ input: { 'aria-label': `${EVENT_LABELS_NL[event].title} (e-mail)` } }}
						/>
					}
				/>
			))}
			{/* MOCK: a locked critical "mailbox issue" email — no such event exists in the
			    backend matrix. Always on, cannot be disabled, surfaced to match the design. */}
			<NotifRow
				title='Mailbox-probleem'
				description='Als een verbinding wordt verbroken of toegang ingetrokken is — je wilt dit direct weten.'
				lockedReason='Kan niet uitgezet worden — kritieke melding.'
				switchSlot={
					<Box sx={{ opacity: 0.5, pointerEvents: 'none' }}>
						<StandaloneSwitch
							name='mailbox-issue-locked'
							checked
							disabled
							onChange={() => {}}
							slotProps={{ input: { 'aria-label': 'Mailbox-probleem (altijd aan)' } }}
						/>
					</Box>
				}
				isLast
			/>
		</SectionCard>
	);
}

function InAppNotificationsCard() {
	return (
		<SectionCard
			title='In de app'
			caption='Zichtbaar als kleine indicator naast het inbox-icoon en in het meldingenpaneel.'
		>
			{NOTIFICATION_EVENT_TYPES.map((event, index) => (
				<NotifRow
					key={event}
					title={EVENT_LABELS_NL[event].title}
					description={EVENT_LABELS_NL[event].description}
					switchSlot={
						<Switch
							name={preferenceKey(event, 'in_app')}
							slotProps={{ input: { 'aria-label': `${EVENT_LABELS_NL[event].title} (in de app)` } }}
						/>
					}
					isLast={index === NOTIFICATION_EVENT_TYPES.length - 1}
				/>
			))}
		</SectionCard>
	);
}

interface SaveBarProps {
	isSaving: boolean;
}

function SaveBar({ isSaving }: SaveBarProps) {
	return (
		<Stack direction='row' useFlexGap spacing={2} sx={{ justifyContent: 'flex-end' }}>
			<Button type='submit' variant='contained' disabled={isSaving}>
				{isSaving ? 'Opslaan…' : 'Voorkeuren opslaan'}
			</Button>
		</Stack>
	);
}

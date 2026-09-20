import { AppIcon, type AppIconName } from '@/components/AppIcon.component';
import { StandaloneField } from '@/components/Form/Field/Field.component';
import { StandaloneSelect } from '@/components/Form/Select/Select.component';
import { StandaloneSwitch } from '@/components/Form/Switch/Switch.component';
import { PageHeader } from '@/components/PageHeader.component';
import { Pill } from '@/components/Pill.component';
import { SectionError } from '@/components/SectionError.component';
import { Body, BodySmall, H3 } from '@/components/Text.component';
import { useToast } from '@/lib/hooks/use-toast';
import { sessionQueryOptions } from '@/lib/queries/auth.queries';
import {
	notificationPreferencesQueryOptions,
	notificationSettingsQueryOptions,
	useUpdateNotificationPreferences,
	useUpdateNotificationSettings
} from '@/lib/queries/notifications.queries';
import { preferenceKey } from '@/lib/schemas/notification-preferences.schema';
import { formatTimeInput, normalizeTime } from '@/lib/utils/time.utils';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import { useTheme } from '@mui/material/styles';
import {
	NOTIFICATION_CHANNELS,
	PREFERENCE_EVENT_TYPES,
	defaultNotificationPreference,
	isEmailChannelAvailable,
	type NotificationChannel,
	type NotificationEventType,
	type NotificationSettings,
	type UpdateNotificationPreferencesInput,
	type WeeklyDigestDay
} from '@offertum/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';

export const Route = createFileRoute('/(app)/settings/notifications')({
	loader: ({ context }) =>
		Promise.all([
			context.queryClient.ensureQueryData(notificationPreferencesQueryOptions),
			context.queryClient.ensureQueryData(notificationSettingsQueryOptions),
			context.queryClient.ensureQueryData(sessionQueryOptions)
		]),
	component: NotificationsSettingsPage,
	errorComponent: SectionError
});

// ── Backend-backed preferences ──────────────────────────────────────────────
// Every matrix cell maps onto a real backend (event, channel) preference except the
// critical, always-on Mailbox-probleem row (rendered as a locked toggle, no preference).

// Flat map of every real (event, channel) → enabled, seeded from stored prefs.
type RealPrefs = Record<string, boolean>;

function seedRealPrefs(
	preferences: ReadonlyArray<{ eventType: NotificationEventType; channel: NotificationChannel; enabled: boolean }>
): RealPrefs {
	const storedByKey = new Map<string, boolean>();
	for (const p of preferences) {
		storedByKey.set(preferenceKey(p.eventType, p.channel), p.enabled);
	}

	const map: RealPrefs = {};
	for (const event of PREFERENCE_EVENT_TYPES) {
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

// The complete API payload from the flat map — always sends every real cell so
// unsurfaced events (auto-cold, daily digest) keep their stored values.
function buildRealPayload(real: RealPrefs): UpdateNotificationPreferencesInput {
	return {
		preferences: PREFERENCE_EVENT_TYPES.flatMap(event =>
			NOTIFICATION_CHANNELS.flatMap(channel =>
				channel === 'email' && !isEmailChannelAvailable(event)
					? []
					: [{ eventType: event, channel, enabled: real[preferenceKey(event, channel)] === true }]
			)
		)
	};
}

interface CadenceState {
	digestDay: string;
	digestTime: string;
	quietFrom: string;
	quietTo: string;
	quietHours: boolean;
}

function cadenceFromSettings(settings: NotificationSettings): CadenceState {
	return {
		digestDay: settings.weeklyDigestDay,
		digestTime: settings.weeklyDigestTime,
		quietFrom: settings.quietHoursStart,
		quietTo: settings.quietHoursEnd,
		quietHours: settings.quietHoursEnabled
	};
}

function cadenceToSettings(cadence: CadenceState): NotificationSettings {
	return {
		weeklyDigestDay: cadence.digestDay as WeeklyDigestDay,
		weeklyDigestTime: cadence.digestTime,
		quietHoursStart: cadence.quietFrom,
		quietHoursEnd: cadence.quietTo,
		quietHoursEnabled: cadence.quietHours
	};
}

// ── Matrix descriptor ────────────────────────────────────────────────────────
type CellSpec =
	| { type: 'real'; event: NotificationEventType; channel: NotificationChannel }
	| { type: 'unavailable' }
	| { type: 'locked' };

interface RowSpec {
	title: string;
	description: string;
	email: CellSpec;
	app: CellSpec;
	lockedReason?: string;
	titleTag?: 'critical';
	isLast?: boolean;
}

const ROWS: RowSpec[] = [
	{
		title: 'Nieuwe offerteaanvraag binnengekomen',
		description: 'Zodra Offertum een nieuwe aanvraag in je mailbox herkent.',
		email: { type: 'real', event: 'opportunity_created', channel: 'email' },
		app: { type: 'real', event: 'opportunity_created', channel: 'in_app' }
	},
	{
		title: 'Klant heeft geantwoord',
		description:
			'Als een klant reageert op een verzonden concept — meerdere antwoorden in korte tijd worden gegroepeerd.',
		email: { type: 'real', event: 'customer_reply', channel: 'email' },
		app: { type: 'real', event: 'customer_reply', channel: 'in_app' }
	},
	{
		title: 'Wekelijkse samenvatting',
		description: 'Overzicht van wat er deze week binnenkwam, beantwoord werd en nog openstaat.',
		email: { type: 'real', event: 'weekly_digest', channel: 'email' },
		app: { type: 'unavailable' }
	},
	{
		title: 'Mailbox-probleem',
		description: 'Als een verbinding wordt verbroken of toegang ingetrokken is — je wilt dit direct weten.',
		email: { type: 'locked' },
		app: { type: 'locked' },
		titleTag: 'critical',
		isLast: true
	}
];

// Shared column template for the matrix header + rows.
const NOTIF_COLS = '1fr 92px 92px';

const DIGEST_DAY_OPTIONS = [
	{ id: 'monday', label: 'Maandag' },
	{ id: 'tuesday', label: 'Dinsdag' },
	{ id: 'wednesday', label: 'Woensdag' },
	{ id: 'thursday', label: 'Donderdag' },
	{ id: 'friday', label: 'Vrijdag' },
	{ id: 'saturday', label: 'Zaterdag' },
	{ id: 'sunday', label: 'Zondag' }
];

function NotificationsSettingsPage() {
	const { data: prefs } = useSuspenseQuery(notificationPreferencesQueryOptions);
	const { data: settings } = useSuspenseQuery(notificationSettingsQueryOptions);
	const { data: session } = useSuspenseQuery(sessionQueryOptions);
	const update = useUpdateNotificationPreferences();
	const updateSettings = useUpdateNotificationSettings();
	const toast = useToast();

	const accountEmail = session?.user?.email ?? null;

	const [real, setReal] = useState<RealPrefs>(() => seedRealPrefs(prefs.preferences));
	const [cadence, setCadence] = useState<CadenceState>(() => cadenceFromSettings(settings.settings));

	// Toggling a real cell autosaves immediately; the payload carries every real cell so the
	// events this UI doesn't surface (auto-cold, daily digest) keep their stored values.
	const setRealCell = (event: NotificationEventType, channel: NotificationChannel, value: boolean) => {
		const next = { ...real, [preferenceKey(event, channel)]: value };
		setReal(next);
		update.mutate(buildRealPayload(next), {
			onError: () => toast.error('Opslaan mislukt', 'Je voorkeur is niet opgeslagen. Probeer het opnieuw.')
		});
	};

	// Day-select / quiet-hours-toggle changes and time-field blur commits all go through
	// here — the masked time fields' keystroke-by-keystroke onChange updates local state
	// only (see `setCadence` passed as `onFieldChange` below) and does not autosave.
	const commitCadence = (next: CadenceState) => {
		// A cleared time field normalizes to '' — never persist that (the DTO would 400 and the
		// bad value would poison every later save). Revert any invalid time to the last-saved value.
		const saved = cadenceFromSettings(settings.settings);
		const validTime = (value: string, fallback: string) => (/^\d{1,2}:\d{2}$/.test(value) ? value : fallback);
		const sanitized: CadenceState = {
			...next,
			digestTime: validTime(next.digestTime, saved.digestTime),
			quietFrom: validTime(next.quietFrom, saved.quietFrom),
			quietTo: validTime(next.quietTo, saved.quietTo)
		};
		setCadence(sanitized);
		updateSettings.mutate(cadenceToSettings(sanitized), {
			onError: () => toast.error('Opslaan mislukt', 'Je instelling is niet opgeslagen. Probeer het opnieuw.')
		});
	};

	// Resolve a cell spec to the props NotifCell renders. Handlers close over the state above.
	const resolveCell = (cell: CellSpec, rowTitle: string, channelLabel: string): CellRenderProps => {
		if (cell.type === 'unavailable') {
			return { kind: 'unavailable' };
		}
		if (cell.type === 'locked') {
			return { kind: 'locked', name: `${rowTitle}-${channelLabel}`, ariaLabel: `${rowTitle} (${channelLabel})` };
		}
		const key = preferenceKey(cell.event, cell.channel);
		return {
			kind: 'switch',
			name: key,
			ariaLabel: `${rowTitle} (${channelLabel})`,
			checked: real[key] === true,
			onChange: value => setRealCell(cell.event, cell.channel, value)
		};
	};

	return (
		<Stack>
			<PageHeader
				title='Notificaties'
				caption='Bepaal hoe en wanneer Offertum je laat weten dat er iets gebeurt. Voorkeuren gelden alleen voor jouw account.'
			/>

			<Stack useFlexGap spacing={4}>
				{/* Meldingen — per gebeurtenis, per kanaal */}
				<SectionCard
					title='Meldingen'
					caption={
						accountEmail ? (
							<>
								Kies per gebeurtenis welk kanaal je wilt. E-mail gaat naar{' '}
								<Box component='span' sx={{ color: 'text.primary', fontWeight: 'medium' }}>
									{accountEmail}
								</Box>
								; in de app zie je een indicator naast het inbox-icoon.
							</>
						) : (
							'Kies per gebeurtenis welk kanaal je wilt: e-mail naar je account, of een indicator in de app.'
						)
					}
				>
					<NotifMatrixHeader />
					{ROWS.map(row => (
						<NotifMatrixRow
							key={row.title}
							row={row}
							emailCell={resolveCell(row.email, row.title, 'e-mail')}
							appCell={resolveCell(row.app, row.title, 'in de app')}
						/>
					))}
				</SectionCard>

				{/* Cadans */}
				<CadenceCard cadence={cadence} onFieldChange={setCadence} onCommit={commitCadence} />
			</Stack>
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
			<Box sx={{ py: 2.5, px: 3, borderBottom: `1px solid ${tokens.color.line}` }}>
				<H3 sx={{ display: 'block' }}>{title}</H3>
				<BodySmall color='textSecondary' sx={{ display: 'block' }}>
					{caption}
				</BodySmall>
			</Box>
			{children}
		</Paper>
	);
}

// Column header band — an empty label cell + the two centered channel captions.
function NotifMatrixHeader() {
	const { tokens } = useTheme();
	return (
		<Box
			sx={{
				display: 'grid',
				gridTemplateColumns: NOTIF_COLS,
				alignItems: 'center',
				gap: 2,
				py: 1.25,
				px: 3,
				backgroundColor: tokens.color.paper2,
				borderBottom: `1px solid ${tokens.color.line}`
			}}
		>
			<span />
			<ChannelHeading>E-mail</ChannelHeading>
			<ChannelHeading>In de app</ChannelHeading>
		</Box>
	);
}

function ChannelHeading({ children }: { children: React.ReactNode }) {
	const { tokens } = useTheme();
	return (
		<BodySmall
			sx={{
				textAlign: 'center',
				color: tokens.color.ink3,
				fontSize: 11,
				fontWeight: 'medium',
				textTransform: 'uppercase',
				letterSpacing: '0.06em'
			}}
		>
			{children}
		</BodySmall>
	);
}

function NotifMatrixRow({
	row,
	emailCell,
	appCell
}: {
	row: RowSpec;
	emailCell: CellRenderProps;
	appCell: CellRenderProps;
}) {
	const { tokens } = useTheme();
	return (
		<Box
			sx={{
				display: 'grid',
				gridTemplateColumns: NOTIF_COLS,
				alignItems: 'center',
				gap: 2,
				py: 2,
				px: 3,
				borderBottom: row.isLast ? 'none' : `1px solid ${tokens.color.line}`
			}}
		>
			<Box sx={{ minWidth: 0 }}>
				<Stack direction='row' useFlexGap spacing={1} sx={{ alignItems: 'center' }}>
					<Body fontWeight='medium'>{row.title}</Body>
					{row.titleTag === 'critical' && <Pill tone='lost'>Kritiek</Pill>}
				</Stack>
				<BodySmall color='textSecondary' sx={{ display: 'block', mt: 0.25 }}>
					{row.description}
				</BodySmall>
				{row.lockedReason && (
					<Stack
						direction='row'
						useFlexGap
						spacing={0.5}
						sx={{ alignItems: 'center', mt: 0.5, color: tokens.color.ink4 }}
					>
						<AppIcon name='lock' size='small' />
						<BodySmall color='inherit'>{row.lockedReason}</BodySmall>
					</Stack>
				)}
			</Box>
			<NotifCell {...emailCell} />
			<NotifCell {...appCell} />
		</Box>
	);
}

type CellRenderProps =
	| { kind: 'unavailable' }
	| { kind: 'locked'; name: string; ariaLabel: string }
	| { kind: 'switch'; name: string; ariaLabel: string; checked: boolean; onChange: (value: boolean) => void };

function NotifCell(props: CellRenderProps) {
	const { tokens } = useTheme();

	if (props.kind === 'unavailable') {
		return (
			<Box
				title='Niet beschikbaar voor dit kanaal'
				sx={{ display: 'flex', justifyContent: 'center', color: tokens.color.ink4 }}
			>
				—
			</Box>
		);
	}

	const isLocked = props.kind === 'locked';
	return (
		<Box
			sx={{
				display: 'flex',
				justifyContent: 'center',
				opacity: isLocked ? 0.5 : 1,
				pointerEvents: isLocked ? 'none' : 'auto'
			}}
		>
			<StandaloneSwitch
				name={props.name}
				checked={isLocked ? true : props.checked}
				disabled={isLocked}
				onChange={isLocked ? () => {} : props.onChange}
				slotProps={{ input: { 'aria-label': props.ariaLabel } }}
			/>
		</Box>
	);
}

function CadenceCard({
	cadence,
	onFieldChange,
	onCommit
}: {
	cadence: CadenceState;
	onFieldChange: (next: CadenceState) => void;
	onCommit: (next: CadenceState) => void;
}) {
	const { tokens } = useTheme();
	return (
		<SectionCard title='Cadans' caption='Wanneer Offertum je dingen mag sturen — en wanneer juist niet.'>
			<Box
				sx={{
					py: 3,
					px: 3,
					display: 'grid',
					gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
					gap: 2
				}}
			>
				<StandaloneSelect
					name='digest-day'
					label='Wekelijkse samenvatting op'
					value={cadence.digestDay}
					options={DIGEST_DAY_OPTIONS}
					onChange={event => onCommit({ ...cadence, digestDay: event.target.value })}
					fullWidth
				/>
				<TimeField
					name='digest-time'
					label='Tijdstip'
					icon='clock'
					value={cadence.digestTime}
					onChange={value => onFieldChange({ ...cadence, digestTime: value })}
					onCommit={value => onCommit({ ...cadence, digestTime: value })}
				/>
			</Box>
			<Stack
				direction='row'
				useFlexGap
				spacing={2}
				sx={{
					py: 2,
					px: 3,
					alignItems: 'center',
					justifyContent: 'space-between',
					borderTop: `1px solid ${tokens.color.line}`
				}}
			>
				<Box sx={{ flex: 1, minWidth: 0 }}>
					<Body fontWeight='medium' sx={{ display: 'block' }}>
						Stille uren
					</Body>
					<BodySmall color='textSecondary' sx={{ display: 'block' }}>
						Geen meldingen tussen {cadence.quietFrom} en {cadence.quietTo}. Kritieke aanvragen breken er wél
						doorheen.
					</BodySmall>
				</Box>
				<Box sx={{ flexShrink: 0 }}>
					<StandaloneSwitch
						name='cadence-quiet-hours'
						checked={cadence.quietHours}
						onChange={value => onCommit({ ...cadence, quietHours: value })}
						slotProps={{ input: { 'aria-label': 'Stille uren' } }}
					/>
				</Box>
			</Stack>
			{cadence.quietHours && (
				<Box
					sx={{
						py: 2,
						px: 3,
						display: 'grid',
						gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
						gap: 2,
						backgroundColor: tokens.color.paper2,
						borderTop: `1px solid ${tokens.color.line}`
					}}
				>
					<TimeField
						name='quiet-from'
						label='Stil vanaf'
						icon='moon'
						value={cadence.quietFrom}
						onChange={value => onFieldChange({ ...cadence, quietFrom: value })}
						onCommit={value => onCommit({ ...cadence, quietFrom: value })}
					/>
					<TimeField
						name='quiet-to'
						label='Weer meldingen vanaf'
						icon='sunrise'
						value={cadence.quietTo}
						onChange={value => onFieldChange({ ...cadence, quietTo: value })}
						onCommit={value => onCommit({ ...cadence, quietTo: value })}
					/>
				</Box>
			)}
		</SectionCard>
	);
}

// A masked HH:MM text field — only ever holds a valid time (see formatTimeInput). Every
// keystroke goes through `onChange` (local state only); the normalized value on blur goes
// through `onCommit` (autosave) so callers don't persist mid-typed, potentially-invalid input.
function TimeField({
	name,
	label,
	icon,
	value,
	onChange,
	onCommit
}: {
	name: string;
	label: string;
	icon: AppIconName;
	value: string;
	onChange: (value: string) => void;
	onCommit: (value: string) => void;
}) {
	return (
		<StandaloneField
			name={name}
			label={label}
			value={value}
			onChange={event => onChange(formatTimeInput(event.target.value))}
			onBlur={() => onCommit(normalizeTime(value))}
			startElement={<AppIcon name={icon} size='small' />}
			placeholder='00:00'
			fullWidth
			slotProps={{ htmlInput: { inputMode: 'numeric', 'aria-label': label } }}
		/>
	);
}

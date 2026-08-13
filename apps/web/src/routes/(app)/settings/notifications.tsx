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
	useUpdateNotificationPreferences
} from '@/lib/queries/notifications.queries';
import { preferenceKey } from '@/lib/schemas/notification-preferences.schema';
import { formatTimeInput, normalizeTime } from '@/lib/utils/time.utils';
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

export const Route = createFileRoute('/(app)/settings/notifications')({
	loader: ({ context }) =>
		Promise.all([
			context.queryClient.ensureQueryData(notificationPreferencesQueryOptions),
			context.queryClient.ensureQueryData(sessionQueryOptions)
		]),
	component: NotificationsSettingsPage,
	errorComponent: SectionError
});

// ── Backend-backed preferences ──────────────────────────────────────────────
// The real notification matrix the API models. Only three cells in the design
// map onto it today (see ROWS); the rest are FE-only mocks pending backend work.

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

// The complete API payload from the flat map — always sends every real cell so
// unsurfaced events (auto-cold, daily digest) keep their stored values.
function buildRealPayload(real: RealPrefs): UpdateNotificationPreferencesInput {
	return {
		preferences: NOTIFICATION_EVENT_TYPES.flatMap(event =>
			NOTIFICATION_CHANNELS.flatMap(channel =>
				channel === 'email' && !isEmailChannelAvailable(event)
					? []
					: [{ eventType: event, channel, enabled: real[preferenceKey(event, channel)] === true }]
			)
		)
	};
}

// ── FE-only mock toggles ─────────────────────────────────────────────────────
// Events / channels the backend doesn't model yet. Local state only; defaults
// mirror the design. Persistence lands once the backend catches up.
type MockKey = 'emailNewQuote' | 'emailCustomerReply';

const MOCK_DEFAULTS: Record<MockKey, boolean> = {
	emailNewQuote: true,
	emailCustomerReply: true
};

interface CadenceState {
	digestDay: string;
	digestTime: string;
	quietFrom: string;
	quietTo: string;
	quietHours: boolean;
}

const CADENCE_DEFAULTS: CadenceState = {
	digestDay: 'monday',
	digestTime: '08:00',
	quietFrom: '19:00',
	quietTo: '07:30',
	quietHours: true
};

// ── Matrix descriptor ────────────────────────────────────────────────────────
type CellSpec =
	| { type: 'real'; event: NotificationEventType; channel: NotificationChannel }
	| { type: 'mock'; key: MockKey }
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
		email: { type: 'mock', key: 'emailNewQuote' },
		app: { type: 'real', event: 'opportunity_created', channel: 'in_app' }
	},
	{
		title: 'Klant heeft geantwoord',
		description:
			'Als een klant reageert op een verzonden concept — meerdere antwoorden in korte tijd worden gegroepeerd.',
		email: { type: 'mock', key: 'emailCustomerReply' },
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
	{ id: 'friday', label: 'Vrijdag' }
];

function NotificationsSettingsPage() {
	const { data: prefs } = useSuspenseQuery(notificationPreferencesQueryOptions);
	const { data: session } = useSuspenseQuery(sessionQueryOptions);
	const update = useUpdateNotificationPreferences();
	const toast = useToast();

	const accountEmail = session?.user?.email ?? null;

	const [real, setReal] = useState<RealPrefs>(() => seedRealPrefs(prefs.preferences));
	const [mock, setMock] = useState<Record<MockKey, boolean>>(MOCK_DEFAULTS);
	const [cadence, setCadence] = useState<CadenceState>(CADENCE_DEFAULTS);

	// Toggling a real cell autosaves immediately; the payload carries every real cell so the
	// events this UI doesn't surface (auto-cold, daily digest) keep their stored values.
	const setRealCell = (event: NotificationEventType, channel: NotificationChannel, value: boolean) => {
		const next = { ...real, [preferenceKey(event, channel)]: value };
		setReal(next);
		update.mutate(buildRealPayload(next), {
			onError: () => toast.error('Opslaan mislukt', 'Je voorkeur is niet opgeslagen. Probeer het opnieuw.')
		});
	};

	const setMockCell = (key: MockKey, value: boolean) => setMock(prev => ({ ...prev, [key]: value }));

	const restoreDefaults = () => {
		const realDefaults = seedRealPrefs([]);
		setReal(realDefaults);
		setMock(MOCK_DEFAULTS);
		setCadence(CADENCE_DEFAULTS);
		update.mutate(buildRealPayload(realDefaults), {
			onError: () => toast.error('Opslaan mislukt', 'Herstellen is niet gelukt. Probeer het opnieuw.')
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
		if (cell.type === 'real') {
			const key = preferenceKey(cell.event, cell.channel);
			return {
				kind: 'switch',
				name: key,
				ariaLabel: `${rowTitle} (${channelLabel})`,
				checked: real[key] === true,
				onChange: value => setRealCell(cell.event, cell.channel, value)
			};
		}
		return {
			kind: 'switch',
			name: cell.key,
			ariaLabel: `${rowTitle} (${channelLabel})`,
			checked: mock[cell.key],
			onChange: value => setMockCell(cell.key, value)
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
				<CadenceCard cadence={cadence} onChange={setCadence} />

				{/* Save bar — real cells autosave on toggle; this only restores defaults. */}
				<Stack direction='row' useFlexGap spacing={2} sx={{ justifyContent: 'flex-end' }}>
					<Button type='button' variant='outlined' disabled={update.isPending} onClick={restoreDefaults}>
						Standaardwaarden herstellen
					</Button>
				</Stack>
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

function CadenceCard({ cadence, onChange }: { cadence: CadenceState; onChange: (next: CadenceState) => void }) {
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
					onChange={event => onChange({ ...cadence, digestDay: event.target.value })}
					fullWidth
				/>
				<TimeField
					name='digest-time'
					label='Tijdstip'
					icon='clock'
					value={cadence.digestTime}
					onChange={value => onChange({ ...cadence, digestTime: value })}
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
						onChange={value => onChange({ ...cadence, quietHours: value })}
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
						onChange={value => onChange({ ...cadence, quietFrom: value })}
					/>
					<TimeField
						name='quiet-to'
						label='Weer meldingen vanaf'
						icon='sunrise'
						value={cadence.quietTo}
						onChange={value => onChange({ ...cadence, quietTo: value })}
					/>
				</Box>
			)}
		</SectionCard>
	);
}

// A masked HH:MM text field — only ever holds a valid time (see formatTimeInput).
function TimeField({
	name,
	label,
	icon,
	value,
	onChange
}: {
	name: string;
	label: string;
	icon: AppIconName;
	value: string;
	onChange: (value: string) => void;
}) {
	return (
		<StandaloneField
			name={name}
			label={label}
			value={value}
			onChange={event => onChange(formatTimeInput(event.target.value))}
			onBlur={() => onChange(normalizeTime(value))}
			startElement={<AppIcon name={icon} size='small' />}
			placeholder='00:00'
			fullWidth
			slotProps={{ htmlInput: { inputMode: 'numeric', 'aria-label': label } }}
		/>
	);
}

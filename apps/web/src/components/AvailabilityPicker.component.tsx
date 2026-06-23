import { AppIcon } from '@/components/AppIcon.component';
import {
	getMockBusyWindows,
	MOCK_DEFAULT_SELECTED_DATE,
	MOCK_PARTIAL_PROVIDER_FAILURE,
	MOCK_PICKER_TODAY,
	type BusyWindow
} from '@/components/AvailabilityPicker.mock';
import { Banner } from '@/components/Banner.component';
import { StandaloneDateTimePicker } from '@/components/Form/DateTimePicker/DateTimePicker.component';
import { BodySmall, Label } from '@/components/Text.component';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import { useTheme } from '@mui/material/styles';
import { Link } from '@tanstack/react-router';
import dayjs, { type Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';

/**
 * AvailabilityPicker — anchored popover for scheduling an opname/inspection with the
 * customer against the owner's connected-calendar busy/free windows. Privacy: only
 * busy/free, never event titles.
 *
 * BACKED vs MOCK split (see `AvailabilityPicker.mock.ts`):
 *  - Connected providers are derived from the REAL mailbox status passed in via
 *    `connectedProviders` (those endpoints exist).
 *  - The busy WINDOWS are mock data — there is no free/busy endpoint and the OAuth scopes
 *    don't include calendar read. When that lands, swap `getMockBusyWindows` for a real
 *    `queryOptions` fetch; the component shape is unchanged.
 *
 * No-calendar fallback: when `connectedProviders` is empty, the picker degrades to a plain
 * `StandaloneDateTimePicker` with a "Geen agenda verbonden" warning linking to Settings.
 *
 * The committed value is emitted via `onConfirm(isoString | null)` so the consumer can
 * autosave the appointment exactly like the bare date-time picker did.
 */

export type CalendarProvider = 'google' | 'microsoft';

interface AvailabilityPickerProps {
	open: boolean;
	anchorEl: HTMLElement | null;
	// Providers whose calendar is connected (derived from real mailbox status).
	connectedProviders: CalendarProvider[];
	value: Dayjs | null;
	onClose: () => void;
	onConfirm: (iso: string | null) => void;
}

const HOUR_START = 7;
const HOUR_END = 19;
const SLOT_MIN = 30;
const STRIP_DAYS = 14;
const DOW_SHORT = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];

interface SlotState {
	time: string;
	busy: boolean;
	// First slot of a contiguous busy run — anchors the merged busy block.
	busyStart: boolean;
	busySpan: number;
}

interface DayState {
	allDayLabel: string | null;
	slots: SlotState[];
}

function ymd(d: Dayjs): string {
	return d.format('YYYY-MM-DD');
}

function timeToMin(t: string): number {
	const [h, m] = t.split(':').map(Number);
	return (h ?? 0) * 60 + (m ?? 0);
}

function minToTime(min: number): string {
	const h = Math.floor(min / 60);
	const m = min % 60;
	return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Computes per-slot busy/free state for a date from its busy windows. */
function computeDay(busy: BusyWindow[]): DayState {
	const allDay = busy.find(b => b.allDay);
	if (allDay) {
		return { allDayLabel: allDay.label ?? 'Hele dag bezet', slots: [] };
	}

	const slots: SlotState[] = [];
	for (let t = HOUR_START * 60; t < HOUR_END * 60; t += SLOT_MIN) {
		slots.push({ time: minToTime(t), busy: false, busyStart: false, busySpan: 0 });
	}

	for (const b of busy) {
		if (b.allDay || !b.start || !b.end) {
			continue;
		}
		const start = timeToMin(b.start);
		const end = timeToMin(b.end);
		for (const slot of slots) {
			const slotStart = timeToMin(slot.time);
			if (slotStart >= start && slotStart < end) {
				slot.busy = true;
			}
		}
	}

	// Mark the first slot of each contiguous busy run so we render one merged block.
	for (let i = 0; i < slots.length; i++) {
		const slot = slots[i];
		if (slot && slot.busy && (i === 0 || !slots[i - 1]?.busy)) {
			let span = 1;
			let j = i + 1;
			while (j < slots.length && slots[j]?.busy) {
				span++;
				j++;
			}
			slot.busyStart = true;
			slot.busySpan = span;
		}
	}

	return { allDayLabel: null, slots };
}

function countFree(day: DayState): number {
	if (day.allDayLabel) {
		return 0;
	}
	return day.slots.filter(s => !s.busy).length;
}

const PROVIDER_LABELS: Record<CalendarProvider, string> = {
	google: 'Google Agenda',
	microsoft: 'Outlook'
};

function providerHeader(providers: CalendarProvider[]): string | null {
	if (providers.length === 0) {
		return null;
	}
	if (providers.length === 1 && providers[0]) {
		return `Beschikbaarheid via ${PROVIDER_LABELS[providers[0]]}`;
	}
	return "Beschikbaarheid via alle verbonden agenda's";
}

function providerFailedNote(providers: CalendarProvider[]): string | null {
	if (MOCK_PARTIAL_PROVIDER_FAILURE && providers.length > 1 && providers.includes(MOCK_PARTIAL_PROVIDER_FAILURE)) {
		const ok = providers.find(p => p !== MOCK_PARTIAL_PROVIDER_FAILURE);
		if (!ok) {
			return null;
		}
		return `Beschikbaarheid gebaseerd op ${PROVIDER_LABELS[ok]} — ${PROVIDER_LABELS[MOCK_PARTIAL_PROVIDER_FAILURE]} is verbonden maar gaf geen antwoord.`;
	}
	return null;
}

export function AvailabilityPicker({
	open,
	anchorEl,
	connectedProviders,
	value,
	onClose,
	onConfirm
}: AvailabilityPickerProps) {
	const isNoCalendar = connectedProviders.length === 0;

	return (
		<Popover
			open={open}
			anchorEl={anchorEl}
			onClose={onClose}
			anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
			transformOrigin={{ vertical: 'top', horizontal: 'left' }}
			slotProps={{
				paper: {
					'aria-label': 'Beschikbaarheid kiezen',
					sx: theme => ({
						width: 560,
						maxWidth: 'calc(100vw - 24px)',
						mt: 1,
						borderRadius: `${theme.tokens.radius.lg}px`,
						border: `1px solid ${theme.tokens.color.line}`,
						boxShadow: theme.tokens.shadow[3],
						overflow: 'hidden'
					})
				}
			}}
		>
			{isNoCalendar ? (
				<NoCalendarFallback value={value} onCancel={onClose} onConfirm={onConfirm} />
			) : (
				<AvailabilityBody connectedProviders={connectedProviders} onCancel={onClose} onConfirm={onConfirm} />
			)}
		</Popover>
	);
}

interface AvailabilityBodyProps {
	connectedProviders: CalendarProvider[];
	onCancel: () => void;
	onConfirm: (iso: string | null) => void;
}

function AvailabilityBody({ connectedProviders, onCancel, onConfirm }: AvailabilityBodyProps) {
	const { tokens } = useTheme();
	// MUI Popover unmounts its children on close (keepMounted defaults to false), so this
	// component remounts on every open — these initial values ARE the reset-on-open behavior.
	const [selectedDate, setSelectedDate] = useState(MOCK_DEFAULT_SELECTED_DATE);
	const [selectedTime, setSelectedTime] = useState<string | null>(null);

	const days = useMemo(
		() => Array.from({ length: STRIP_DAYS }, (_, i) => dayjs(MOCK_PICKER_TODAY).add(i, 'day')),
		[]
	);
	const day = computeDay(getMockBusyWindows(selectedDate));
	const header = providerHeader(connectedProviders);
	const partialNote = providerFailedNote(connectedProviders);

	const handleConfirm = () => {
		if (!selectedTime) {
			return;
		}
		const [h, m] = selectedTime.split(':').map(Number);
		const iso = dayjs(selectedDate)
			.hour(h ?? 0)
			.minute(m ?? 0)
			.second(0)
			.millisecond(0)
			.toISOString();
		onConfirm(iso);
		onCancel();
	};

	return (
		<Box>
			{/* Provider header chip */}
			{header && (
				<Box
					sx={{
						display: 'inline-flex',
						alignItems: 'center',
						gap: 1,
						mx: 2.5,
						mt: 2,
						mb: 1.5,
						px: 1.25,
						py: 0.75,
						bgcolor: tokens.color.accent[50],
						color: tokens.color.accent[700],
						borderRadius: `${tokens.radius.sm}px`
					}}
				>
					<AppIcon name='calendar' size='small' />
					<Label fontWeight='medium' color='inherit'>
						{header}
					</Label>
				</Box>
			)}

			{/* 14-day date strip */}
			<Box
				sx={{
					display: 'grid',
					gridTemplateColumns: `repeat(${days.length}, 1fr)`,
					gap: 0.5,
					px: 2,
					pb: 1.5
				}}
			>
				{days.map(d => {
					const s = ymd(d);
					const dayState = computeDay(getMockBusyWindows(s));
					const free = countFree(dayState);
					const isSelected = s === selectedDate;
					const isDisabled = free === 0;
					return (
						<Box
							key={s}
							component='button'
							type='button'
							disabled={isDisabled}
							onClick={() => {
								if (isDisabled) {
									return;
								}
								setSelectedDate(s);
								setSelectedTime(null);
							}}
							title={dayState.allDayLabel ?? `${free} vrije slots`}
							sx={{
								appearance: 'none',
								font: 'inherit',
								py: 0.75,
								display: 'flex',
								flexDirection: 'column',
								alignItems: 'center',
								gap: 0.25,
								cursor: isDisabled ? 'not-allowed' : 'pointer',
								borderRadius: `${tokens.radius.sm}px`,
								border: '1px solid',
								borderColor: isSelected ? tokens.color.accent[500] : 'transparent',
								bgcolor: isSelected
									? tokens.color.accent[500]
									: isDisabled
										? tokens.color.paper2
										: 'transparent',
								color: isSelected
									? tokens.color.accent.fg
									: isDisabled
										? tokens.color.ink4
										: tokens.color.ink2,
								transition: `background ${tokens.motion.durBase}ms ${tokens.motion.easeOut}, color ${tokens.motion.durBase}ms ${tokens.motion.easeOut}, border-color ${tokens.motion.durBase}ms ${tokens.motion.easeOut}`,
								'&:hover:not(:disabled)': {
									bgcolor: isSelected ? tokens.color.accent[500] : tokens.color.paper3
								}
							}}
						>
							<Box
								component='span'
								sx={{
									fontSize: 10,
									fontWeight: 600,
									letterSpacing: '0.04em',
									textTransform: 'uppercase',
									opacity: isSelected ? 0.9 : 0.7
								}}
							>
								{DOW_SHORT[d.day()]}
							</Box>
							<Box
								component='span'
								sx={{
									fontFamily: tokens.font.display,
									fontSize: 16,
									fontWeight: 500,
									letterSpacing: '-0.01em',
									textDecoration: isDisabled && !isSelected ? 'line-through' : 'none'
								}}
							>
								{d.date()}
							</Box>
							{free > 0 && !isSelected && (
								<Box
									component='span'
									aria-hidden
									sx={{
										width: 4,
										height: 4,
										borderRadius: '50%',
										bgcolor: tokens.color.accent[500],
										opacity: 0.7,
										mt: 0.25
									}}
								/>
							)}
						</Box>
					);
				})}
			</Box>

			{/* Hour grid for the selected day */}
			<Box sx={{ borderTop: `1px solid ${tokens.color.line}`, p: 2, maxHeight: 360, overflowY: 'auto' }}>
				<HourGrid day={day} selectedTime={selectedTime} onSelect={setSelectedTime} />
			</Box>

			{/* Partial-provider-failure note */}
			{partialNote && (
				<Box
					sx={{
						display: 'flex',
						alignItems: 'flex-start',
						gap: 0.75,
						px: 2,
						py: 1,
						bgcolor: tokens.color.paper2,
						borderTop: `1px solid ${tokens.color.line}`,
						color: tokens.color.ink3
					}}
				>
					<Box
						component='span'
						sx={{ mt: 0.25, flexShrink: 0, color: tokens.color.ink4, display: 'inline-flex' }}
					>
						<AppIcon name='info' size='small' />
					</Box>
					<BodySmall color='inherit'>{partialNote}</BodySmall>
				</Box>
			)}

			{/* Footer actions */}
			<Stack
				direction='row'
				spacing={1}
				sx={{
					justifyContent: 'flex-end',
					p: 1.5,
					borderTop: `1px solid ${tokens.color.line}`,
					bgcolor: tokens.color.paper2
				}}
			>
				<Button variant='text' color='inherit' onClick={onCancel}>
					Annuleren
				</Button>
				<Button
					variant='contained'
					disabled={!selectedTime}
					startIcon={<AppIcon name='check' size='medium' />}
					onClick={handleConfirm}
				>
					{selectedTime ? `Bevestig ${selectedTime}` : 'Kies een tijd'}
				</Button>
			</Stack>
		</Box>
	);
}

interface HourGridProps {
	day: DayState;
	selectedTime: string | null;
	onSelect: (time: string) => void;
}

function HourGrid({ day, selectedTime, onSelect }: HourGridProps) {
	const { tokens } = useTheme();

	if (day.allDayLabel) {
		return (
			<Box
				sx={{
					py: 4,
					px: 1.5,
					textAlign: 'center',
					bgcolor: tokens.color.paper2,
					borderRadius: `${tokens.radius.md}px`,
					border: `1px dashed ${tokens.color.lineStrong}`
				}}
			>
				<BodySmall fontWeight='bold' color={tokens.color.ink2} sx={{ mb: 0.5 }}>
					{day.allDayLabel}
				</BodySmall>
				<BodySmall color={tokens.color.ink3}>Geen beschikbare tijden — kies een andere dag.</BodySmall>
			</Box>
		);
	}

	// Walk the slots: render free slots as selectable rows, contiguous busy runs as one
	// hatched block (skipping the continuation slots already covered by the block).
	const rows: React.ReactNode[] = [];
	let i = 0;
	while (i < day.slots.length) {
		const slot = day.slots[i];
		if (!slot) {
			i++;
			continue;
		}
		if (slot.busy) {
			if (slot.busyStart) {
				const end = minToTime(timeToMin(slot.time) + slot.busySpan * SLOT_MIN);
				rows.push(<BusyBlock key={`b${i}`} start={slot.time} end={end} span={slot.busySpan} />);
				i += slot.busySpan;
			} else {
				i++;
			}
		} else {
			rows.push(
				<SlotRow
					key={`s${i}`}
					time={slot.time}
					selected={selectedTime === slot.time}
					onSelect={() => onSelect(slot.time)}
				/>
			);
			i++;
		}
	}

	return (
		<Stack spacing={0.25} role='listbox' aria-label='Beschikbare tijden'>
			{rows}
		</Stack>
	);
}

function SlotRow({ time, selected, onSelect }: { time: string; selected: boolean; onSelect: () => void }) {
	const { tokens } = useTheme();
	return (
		<Box
			component='button'
			type='button'
			role='option'
			aria-selected={selected}
			onClick={onSelect}
			sx={{
				appearance: 'none',
				font: 'inherit',
				display: 'flex',
				alignItems: 'center',
				gap: 1.5,
				width: '100%',
				textAlign: 'left',
				px: 1.5,
				py: 1,
				cursor: 'pointer',
				borderRadius: `${tokens.radius.sm}px`,
				border: '1px solid',
				borderColor: selected ? tokens.color.accent[500] : 'transparent',
				bgcolor: selected ? tokens.color.accent[500] : 'transparent',
				color: selected ? tokens.color.accent.fg : tokens.color.ink2,
				transition: `background ${tokens.motion.durBase}ms ${tokens.motion.easeOut}, color ${tokens.motion.durBase}ms ${tokens.motion.easeOut}`,
				'&:hover': { bgcolor: selected ? tokens.color.accent[500] : tokens.color.accent[50] }
			}}
		>
			<Box
				component='span'
				sx={{ fontSize: 13, fontWeight: 500, fontVariantNumeric: 'tabular-nums', minWidth: 50 }}
			>
				{time}
			</Box>
			<Box component='span' sx={{ fontSize: 12, opacity: 0.8, flex: 1 }}>
				30 min
			</Box>
			{selected && <AppIcon name='check' size='small' />}
		</Box>
	);
}

function BusyBlock({ start, end, span }: { start: string; end: string; span: number }) {
	const { tokens } = useTheme();
	return (
		<Box
			sx={{
				display: 'flex',
				alignItems: 'center',
				gap: 1.5,
				px: 1.5,
				minHeight: span * 32,
				borderRadius: `${tokens.radius.sm}px`,
				border: `1px solid ${tokens.color.line}`,
				color: tokens.color.ink4,
				cursor: 'not-allowed',
				background: `repeating-linear-gradient(135deg, ${tokens.color.paper2} 0 6px, ${tokens.color.paper3} 6px 12px)`
			}}
		>
			<Box
				component='span'
				sx={{ fontSize: 13, fontWeight: 500, fontVariantNumeric: 'tabular-nums', minWidth: 50 }}
			>
				{start}
			</Box>
			<Box component='span' sx={{ fontSize: 12, flex: 1 }}>
				Bezet · tot {end}
			</Box>
			<AppIcon name='lock' size='small' />
		</Box>
	);
}

interface NoCalendarFallbackProps {
	value: Dayjs | null;
	onCancel: () => void;
	onConfirm: (iso: string | null) => void;
}

/**
 * No-calendar fallback — a plain date-time entry plus a warning Alert linking to Settings →
 * E-mailaccounts. Confirms via the same `onConfirm(iso)` contract as the calendar view.
 */
function NoCalendarFallback({ value, onCancel, onConfirm }: NoCalendarFallbackProps) {
	const [draft, setDraft] = useState<Dayjs | null>(value);

	return (
		<Stack spacing={2} sx={{ p: 2.5 }}>
			<Banner tone='warning' icon='alert-triangle'>
				Geen agenda verbonden — verbind via{' '}
				<Link to='/settings/email' style={{ color: 'inherit', textDecoration: 'underline' }}>
					Instellingen → E-mailaccounts
				</Link>{' '}
				om beschikbaarheid te zien.
			</Banner>
			<Box>
				<Label component='label'>Datum en tijd</Label>
				<Box sx={{ mt: 0.5 }}>
					<StandaloneDateTimePicker
						name='appointment-fallback'
						label=''
						value={draft}
						fullWidth
						size='small'
						onChange={next => setDraft(next)}
						onAccept={next => setDraft(next)}
					/>
				</Box>
			</Box>
			<Stack direction='row' spacing={1} sx={{ justifyContent: 'flex-end' }}>
				<Button variant='text' color='inherit' onClick={onCancel}>
					Annuleren
				</Button>
				<Button
					variant='contained'
					disabled={!draft || !draft.isValid()}
					startIcon={<AppIcon name='check' size='medium' />}
					onClick={() => {
						onConfirm(draft && draft.isValid() ? draft.toISOString() : null);
						onCancel();
					}}
				>
					Bevestig
				</Button>
			</Stack>
		</Stack>
	);
}

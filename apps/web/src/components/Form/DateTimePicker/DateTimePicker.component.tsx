import { PickerFooterWithConfirm } from '@/components/Form/PickerFooter.component';
import { useBodyScrollLock } from '@/lib/hooks/use-body-scroll-lock';
import { useDevice } from '@/lib/hooks/useDevice';
import Backdrop from '@mui/material/Backdrop';
import Portal from '@mui/material/Portal';
import type { SxProps, Theme } from '@mui/material/styles';
import { DateTimePicker as MuiDateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { MobileDateTimePicker } from '@mui/x-date-pickers/MobileDateTimePicker';
import { renderDigitalClockTimeView } from '@mui/x-date-pickers/timeViewRenderers';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import slugify from 'slugify';
import type { DateTimePickerProps } from './DateTimePicker.types';

/**
 * Mirrors the `DatePicker` scaffold (same SX, same mobile-vs-desktop split) but
 * captures a time component too. Used for fields where the time of day is part of
 * the meaning — appointments, deliveries with a slot, etc. Deadlines stay on
 * `DatePicker` because customers usually express deadlines as a day, not a moment.
 *
 * The time view is a single-column digital clock ("TIJD" column in the design) listing
 * slots at `minutesStep` intervals, rather than MUI's default multi-section clock.
 */

const textFieldStyles: SxProps<Theme> = {
	'label + &': {
		marginTop: theme => theme.spacing(3)
	}
};

// Calendar-popover surface — radius-lg card with a hairline border + soft shadow (design DS).
const popoverPaperSx: SxProps<Theme> = {
	borderRadius: theme => `${theme.tokens.radius.lg}px`,
	border: theme => `1px solid ${theme.tokens.color.line}`,
	boxShadow: theme => theme.tokens.shadow[2],
	marginTop: theme => theme.spacing(1),
	overflow: 'hidden'
};

// Two date values represent the same instant (handles the null cases too).
const isSameValue = (a: Dayjs | null, b: Dayjs | null) => (a && b ? a.isSame(b) : a === b);

// Single-column digital clock for the time view (calendar | TIJD column), 30-min default steps.
const timeViewRenderers = {
	hours: renderDigitalClockTimeView,
	minutes: null,
	seconds: null
};

export const StandaloneDateTimePicker = ({
	value,
	name,
	label,
	onChange,
	onAccept,
	minDate,
	maxDate,
	fullWidth,
	required,
	error,
	helperText,
	format = 'D MMM YYYY · HH:mm',
	size = 'small',
	disabled = false,
	minutesStep = 15
}: DateTimePickerProps & { value: Dayjs | null }) => {
	const [isOpen, setIsOpen] = useState(false);
	const { isMdDown } = useDevice();

	// Desktop popover is a Popper (no Modal), so lock body scroll while open — same as a Select.
	// Mobile uses a Dialog, which already locks.
	useBodyScrollLock(isOpen && !isMdDown);

	// MUI v6+ pickers need the parent to reflect onChange into the value prop for
	// the multi-view flow (year → month → day → hour → minute) to advance. Local
	// mirror lets the picker progress through views while consumers only see the
	// committed value via onAccept. Re-syncs from the external value prop using the
	// render-phase derived-state pattern (avoids a useEffect re-render cycle).
	const [internalValue, setInternalValue] = useState<Dayjs | null>(value);
	const [prevValue, setPrevValue] = useState<Dayjs | null>(value);

	// Compare by instant, NOT object identity: the parent builds a fresh `dayjs(...)` every
	// render, so `value !== prevValue` would be true on every render and resync `internalValue`
	// back to the (stale, pre-mutation) prop — flashing the old value after a selection.
	if (!isSameValue(value, prevValue)) {
		setPrevValue(value);
		setInternalValue(value);
	}

	const handleInternalChange = (date: Dayjs | null) => {
		setInternalValue(date);
		onChange?.(date);
	};

	const labelId = `${slugify(name)}-label`;

	const sharedSlotProps = {
		textField: {
			id: labelId,
			onClick: () => !disabled && setIsOpen(true),
			name,
			error: !!error,
			helperText: error || helperText,
			required,
			fullWidth,
			size,
			sx: textFieldStyles
		},
		field: { clearable: true },
		desktopPaper: { sx: popoverPaperSx }
	} as const;

	return (
		<>
			{/* Dimmed scrim behind the desktop popover (the calendar popper has none of its own),
			    matching the Select/Dialog backdrop. Portaled to <body> so it covers the whole
			    viewport (incl. the app bar) instead of being trapped in a local stacking context.
			    Clicking it closes the picker. */}
			{!isMdDown && (
				<Portal>
					<Backdrop
						open={isOpen}
						onClick={() => setIsOpen(false)}
						sx={{ zIndex: theme => theme.zIndex.modal - 1 }}
					/>
				</Portal>
			)}
			{isMdDown ? (
				<MobileDateTimePicker
					value={internalValue ? dayjs(internalValue) : null}
					onChange={date => handleInternalChange(date ?? null)}
					onAccept={date => {
						onAccept?.(date ?? null);
					}}
					label={label}
					disabled={disabled}
					maxDate={maxDate ? dayjs(maxDate) : undefined}
					minDate={minDate ? dayjs(minDate) : undefined}
					open={isOpen}
					views={['day', 'hours']}
					viewRenderers={timeViewRenderers}
					timeSteps={{ minutes: minutesStep }}
					ampm={false}
					format={format}
					slots={{ actionBar: PickerFooterWithConfirm }}
					slotProps={sharedSlotProps}
					onClose={() => setIsOpen(false)}
				/>
			) : (
				<MuiDateTimePicker
					value={internalValue ? dayjs(internalValue) : null}
					onChange={date => handleInternalChange(date ?? null)}
					onAccept={date => {
						onAccept?.(date ?? null);
					}}
					label={label}
					disabled={disabled}
					maxDate={maxDate ? dayjs(maxDate) : undefined}
					minDate={minDate ? dayjs(minDate) : undefined}
					open={isOpen}
					views={['day', 'hours']}
					viewRenderers={timeViewRenderers}
					timeSteps={{ minutes: minutesStep }}
					ampm={false}
					format={format}
					slots={{ actionBar: PickerFooterWithConfirm }}
					slotProps={sharedSlotProps}
					onClose={() => setIsOpen(false)}
				/>
			)}
		</>
	);
};

import { PickerFooter } from '@/components/Form/PickerFooter.component';
import { useBodyScrollLock } from '@/lib/hooks/use-body-scroll-lock';
import { useDevice } from '@/lib/hooks/useDevice';
import Backdrop from '@mui/material/Backdrop';
import Portal from '@mui/material/Portal';
import type { SxProps, Theme } from '@mui/material/styles';
import { DatePicker as MuiDatePicker } from '@mui/x-date-pickers/DatePicker';
import { MobileDatePicker } from '@mui/x-date-pickers/MobileDatePicker';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import slugify from 'slugify';
import type { DatePickerProps } from './DatePicker.types';

const textFieldStyles: SxProps<Theme> = {
	'label + &': {
		marginTop: theme => theme.spacing(3)
	},
	'& .MuiPickersInputBase-root': {
		'input::-webkit-input-placeholder': {
			// opacity: 0.5
		}
	}
};

// Two date values represent the same instant (handles the null cases too).
const isSameValue = (a: Dayjs | null, b: Dayjs | null) => (a && b ? a.isSame(b) : a === b);

// Calendar-popover surface — radius-lg card with a hairline border + soft shadow (design DS).
const popoverPaperSx: SxProps<Theme> = {
	borderRadius: theme => `${theme.tokens.radius.lg}px`,
	border: theme => `1px solid ${theme.tokens.color.line}`,
	boxShadow: theme => theme.tokens.shadow[2],
	marginTop: theme => theme.spacing(1),
	overflow: 'hidden'
};

export const StandaloneDatePicker = ({
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
	format = 'D MMM YYYY',
	size = 'small',
	disabled = false
}: DatePickerProps & { value: Dayjs | null }) => {
	const [isOpen, setIsOpen] = useState(false);
	const { isMdDown } = useDevice();

	// Desktop popover is a Popper (no Modal), so lock body scroll while open — same as a Select.
	// Mobile uses a Dialog, which already locks.
	useBodyScrollLock(isOpen && !isMdDown);

	// MUI v6+ pickers need the parent to reflect onChange into the value prop for
	// the multi-view flow (year → month → day) to advance. Local mirror lets the
	// picker progress through views while consumers only see the committed value via
	// onAccept. Re-syncs from the external value prop using the render-phase
	// derived-state pattern (avoids a useEffect re-render cycle).
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
				<MobileDatePicker
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
					showDaysOutsideCurrentMonth
					slots={{ actionBar: PickerFooter }}
					slotProps={sharedSlotProps}
					onClose={() => setIsOpen(false)}
				/>
			) : (
				<MuiDatePicker
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
					showDaysOutsideCurrentMonth
					format={format}
					slots={{ actionBar: PickerFooter }}
					slotProps={sharedSlotProps}
					onClose={() => setIsOpen(false)}
				/>
			)}
		</>
	);
};

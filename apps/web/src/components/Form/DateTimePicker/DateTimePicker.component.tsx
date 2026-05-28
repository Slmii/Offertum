import { useDevice } from '@/lib/hooks/useDevice';
import type { SxProps, Theme } from '@mui/material/styles';
import { DateTimePicker as MuiDateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { MobileDateTimePicker } from '@mui/x-date-pickers/MobileDateTimePicker';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import slugify from 'slugify';
import type { DateTimePickerProps } from './DateTimePicker.types';

/**
 * Mirrors the `DatePicker` scaffold (same SX, same mobile-vs-desktop split) but
 * captures a time component too. Used for fields where the time of day is part of
 * the meaning — appointments, deliveries with a slot, etc. Deadlines stay on
 * `DatePicker` because customers usually express deadlines as a day, not a moment.
 */

const textFieldStyles: SxProps<Theme> = {
	'label + &': {
		marginTop: theme => theme.spacing(3)
	}
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
	format = 'DD-MM-YYYY HH:mm',
	size = 'small',
	disabled = false,
	minutesStep = 5
}: DateTimePickerProps & { value: Dayjs | null }) => {
	const [isOpen, setIsOpen] = useState(false);
	const { isMdDown } = useDevice();

	// MUI v6+ pickers need the parent to reflect onChange into the value prop for
	// the multi-view flow (year → month → day → hour → minute) to advance. Local
	// mirror lets the picker progress through views while consumers only see the
	// committed value via onAccept. Re-syncs from the external value prop using the
	// render-phase derived-state pattern (avoids a useEffect re-render cycle).
	const [internalValue, setInternalValue] = useState<Dayjs | null>(value);
	const [prevValue, setPrevValue] = useState<Dayjs | null>(value);

	if (value !== prevValue) {
		setPrevValue(value);
		setInternalValue(value);
	}

	const handleInternalChange = (date: Dayjs | null) => {
		setInternalValue(date);
		onChange?.(date);
	};

	const labelId = `${slugify(name)}-label`;

	return (
		<>
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
					minutesStep={minutesStep}
					ampm={false}
					format={format}
					slotProps={{
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
						field: { clearable: true }
					}}
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
					minutesStep={minutesStep}
					ampm={false}
					format={format}
					slotProps={{
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
						field: { clearable: true }
					}}
					onClose={() => setIsOpen(false)}
				/>
			)}
		</>
	);
};

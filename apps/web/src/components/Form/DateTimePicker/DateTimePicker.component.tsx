import { useDevice } from '@/lib/hooks/useDevice';
import type { SxProps, Theme } from '@mui/material/styles';
import { DateTimePicker as MuiDateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { MobileDateTimePicker } from '@mui/x-date-pickers/MobileDateTimePicker';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
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

	const labelId = `${slugify(name)}-label`;

	return (
		<>
			{isMdDown ? (
				<MobileDateTimePicker
					value={value ? dayjs(value) : null}
					onChange={date => {
						onChange?.(date ?? null);
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
					value={value ? dayjs(value) : null}
					onChange={date => {
						onChange?.(date ?? null);
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

export const DateTimePicker = (props: DateTimePickerProps) => {
	const { control } = useFormContext();

	return (
		<Controller
			name={props.name}
			control={control}
			rules={{
				required: props.required
			}}
			render={({ field, fieldState }) => (
				<StandaloneDateTimePicker
					{...props}
					{...field}
					error={fieldState.error?.message || (props.error ? props.helperText : undefined)}
					onChange={e => {
						field.onChange(e);
						props.onChange?.(e);
					}}
				/>
			)}
		/>
	);
};

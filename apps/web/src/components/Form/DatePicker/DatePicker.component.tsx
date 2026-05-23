import { useDevice } from '@/lib/hooks/useDevice';
import type { SxProps, Theme } from '@mui/material/styles';
import { DatePicker as MuiDatePicker } from '@mui/x-date-pickers/DatePicker';
import { MobileDatePicker } from '@mui/x-date-pickers/MobileDatePicker';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useState } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
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
	format = 'DD-MM-YYYY',
	size = 'small',
	disabled = false
}: DatePickerProps & { value: Dayjs | null }) => {
	const [isOpen, setIsOpen] = useState(false);
	const { isMdDown } = useDevice();

	// MUI v6+ pickers need the parent to reflect onChange into the value prop for
	// the multi-view flow (year → month → day) to advance. Local mirror lets the
	// picker progress through views while consumers only see the committed value via
	// onAccept. Re-syncs from the external value prop on change.
	const [internalValue, setInternalValue] = useState<Dayjs | null>(value);
	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect
		setInternalValue(value);
	}, [value]);

	const handleInternalChange = (date: Dayjs | null) => {
		setInternalValue(date);
		onChange?.(date);
	};

	const labelId = `${slugify(name)}-label`;

	return (
		<>
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

export const DatePicker = (props: DatePickerProps) => {
	const { control } = useFormContext();

	return (
		<Controller
			name={props.name}
			control={control}
			rules={{
				required: props.required
			}}
			render={({ field, fieldState }) => (
				<StandaloneDatePicker
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

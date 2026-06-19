import FormControlLabel from '@mui/material/FormControlLabel';
import MuiCheckbox from '@mui/material/Checkbox';
import { Controller } from 'react-hook-form';
import slugify from 'slugify';
import type { CheckboxProps as FormCheckboxProps, StandaloneCheckboxProps } from './Checkbox.types';

/**
 * Form-bound checkbox (react-hook-form) — mirrors the Switch component's Form/Standalone
 * split so checkboxes compose the same way fields do. Styled centrally via the theme
 * (MUI Checkbox already uses the accent/primary color).
 */
export const Checkbox = ({ name, label, disabled, onChange, ...props }: FormCheckboxProps) => {
	const slugified = `checkbox-${slugify(name)}`;

	return (
		<Controller
			name={name}
			render={({ field }) => (
				<FormControlLabel
					disabled={disabled}
					control={
						<MuiCheckbox
							checked={Boolean(field.value)}
							name={name}
							disabled={disabled}
							onChange={(e, checked) => {
								field.onChange(e);
								onChange?.(checked);
							}}
							slotProps={{ input: { 'aria-labelledby': slugified } }}
							{...props}
						/>
					}
					sx={{ mx: 0 }}
					label={label}
					disableTypography
					labelPlacement='end'
				/>
			)}
		/>
	);
};

export const StandaloneCheckbox = ({ checked, name, label, disabled, onChange, ...props }: StandaloneCheckboxProps) => {
	const slugified = `checkbox-${slugify(name)}`;

	return (
		<FormControlLabel
			disabled={disabled}
			control={
				<MuiCheckbox
					checked={checked}
					name={name}
					disabled={disabled}
					onChange={(_e, isChecked) => onChange(isChecked)}
					slotProps={{ input: { 'aria-labelledby': slugified } }}
					{...props}
				/>
			}
			label={label}
			labelPlacement='end'
			sx={{ minWidth: 'fit-content' }}
			disableTypography
		/>
	);
};

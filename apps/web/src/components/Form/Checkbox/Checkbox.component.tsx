import MuiCheckbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import { Controller } from 'react-hook-form';
import slugify from 'slugify';
import type { CheckboxProps, StandaloneCheckboxProps } from './Checkbox.types';

export const Checkbox = ({ name, label, disabled, onChange, ...props }: CheckboxProps) => {
	const slugified = `checkbox-${slugify(name)}`;

	return (
		<Controller
			name={name}
			render={({ field }) => (
				<FormControlLabel
					disabled={disabled}
					control={
						<MuiCheckbox
							slotProps={{
								input: {
									'aria-labelledby': slugified
								}
							}}
							name={name}
							disabled={disabled}
							checked={field.value}
							size='small'
							onChange={(e, checked) => {
								field.onChange(e);
								onChange?.(e, checked);
							}}
							{...props}
						/>
					}
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
					slotProps={{
						input: {
							'aria-labelledby': slugified
						}
					}}
					name={name}
					disabled={disabled}
					checked={checked}
					size='small'
					onChange={onChange}
					{...props}
				/>
			}
			label={label}
			disableTypography
			labelPlacement='end'
		/>
	);
};

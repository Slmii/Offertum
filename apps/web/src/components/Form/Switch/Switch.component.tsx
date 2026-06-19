import FormControlLabel from '@mui/material/FormControlLabel';
import MuiSwitch from '@mui/material/Switch';
import { Controller } from 'react-hook-form';
import slugify from 'slugify';
import type { SwitchProps as FormSwitchProps, StandaloneSwitchProps } from './Switch.types';

export const Switch = ({ name, label, disabled, onChange, ...props }: FormSwitchProps) => {
	const slugified = `checkbox-${slugify(name)}`;

	return (
		<Controller
			name={name}
			render={({ field }) => (
				<FormControlLabel
					disabled={disabled}
					control={
						<MuiSwitch
							checked={field.value}
							name={name}
							disabled={disabled}
							onChange={(e, checked) => {
								field.onChange(e);
								onChange?.(checked);
							}}
							slotProps={{
								input: {
									'aria-labelledby': slugified
								}
							}}
							{...props}
						/>
					}
					label={label}
					disableTypography
					labelPlacement='end'
					sx={{ minWidth: 'fit-content', mx: 0 }}
				/>
			)}
		/>
	);
};

export const StandaloneSwitch = ({ checked, name, label, disabled, onChange, ...props }: StandaloneSwitchProps) => {
	const slugified = `switch-${slugify(name)}`;

	return (
		<FormControlLabel
			disabled={disabled}
			control={
				<MuiSwitch
					checked={checked}
					name={name}
					disabled={disabled}
					onChange={(_e, checked) => onChange(checked)}
					slotProps={{
						input: {
							'aria-labelledby': slugified
						}
					}}
					{...props}
				/>
			}
			label={label}
			disableTypography
			labelPlacement='end'
			sx={{ minWidth: 'fit-content', mx: 0 }}
		/>
	);
};

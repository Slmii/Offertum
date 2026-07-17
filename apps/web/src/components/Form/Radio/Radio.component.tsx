import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormLabel from '@mui/material/FormLabel';
import InputLabel from '@mui/material/InputLabel';
import MuiRadio from '@mui/material/Radio';
import MuiRadioGroup from '@mui/material/RadioGroup';
import { Controller } from 'react-hook-form';
import type { RadioGroupProps as FormRadioGroupProps, StandaloneRadioGroupProps } from './Radio.types';

/**
 * Radio group — Form (react-hook-form) + Standalone variants, matching the Field/Switch
 * split. Renders one labelled radio per option; styled via the theme (MUI Radio uses the
 * accent/primary color).
 */
export const RadioGroup = ({ name, label, options, disabled, required, row, onChange }: FormRadioGroupProps) => {
	return (
		<Controller
			name={name}
			render={({ field }) => (
				<FormControl disabled={disabled} required={required}>
					{label && <InputLabel>{label}</InputLabel>}
					<MuiRadioGroup
						row={row}
						value={field.value ?? ''}
						onChange={(_e, value) => {
							field.onChange(value);
							onChange?.(value);
						}}
					>
						{options.map(option => (
							<FormControlLabel
								key={option.value}
								value={option.value}
								control={<MuiRadio size='small' />}
								label={option.label}
								disabled={disabled || option.disabled}
							/>
						))}
					</MuiRadioGroup>
				</FormControl>
			)}
		/>
	);
};

export const StandaloneRadioGroup = ({
	name,
	value,
	options,
	onChange,
	label,
	disabled,
	required,
	row
}: StandaloneRadioGroupProps) => {
	return (
		<FormControl disabled={disabled} required={required}>
			{label && <FormLabel>{label}</FormLabel>}
			<MuiRadioGroup name={name} row={row} value={value} onChange={(_e, next) => onChange(next)}>
				{options.map(option => (
					<FormControlLabel
						key={option.value}
						value={option.value}
						control={<MuiRadio size='small' />}
						label={option.label}
						disabled={disabled || option.disabled}
					/>
				))}
			</MuiRadioGroup>
		</FormControl>
	);
};

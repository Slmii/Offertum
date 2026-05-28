import type { SwitchProps as MuiSwitchProps } from '@mui/material';

export interface StandaloneSwitchProps extends Omit<MuiSwitchProps, 'checked' | 'onChange'> {
	name: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
	label?: string;
}

export interface SwitchProps extends Omit<StandaloneSwitchProps, 'checked' | 'onChange'> {
	onChange?: (checked: boolean) => void;
}

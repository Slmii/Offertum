import type { SwitchProps as MuiSwitchProps } from '@mui/material';

export interface StandaloneSwitchProps extends Omit<MuiSwitchProps, 'onChange'> {
	name: string;
	label?: string;
	onChange: (checked: boolean) => void;
}

export interface SwitchProps extends Omit<StandaloneSwitchProps, 'onChange'> {
	onChange?: (checked: boolean) => void;
}

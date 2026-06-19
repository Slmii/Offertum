import type { CheckboxProps as MuiCheckboxProps } from '@mui/material';
import type { ReactNode } from 'react';

export interface StandaloneCheckboxProps extends Omit<MuiCheckboxProps, 'checked' | 'onChange'> {
	name: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
	label?: ReactNode;
}

export interface CheckboxProps extends Omit<StandaloneCheckboxProps, 'checked' | 'onChange'> {
	onChange?: (checked: boolean) => void;
}

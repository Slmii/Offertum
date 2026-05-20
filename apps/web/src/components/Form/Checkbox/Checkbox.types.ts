import type { CheckboxProps as MuiCheckboxProps } from '@mui/material/Checkbox';
import type { ChangeEvent, ReactNode } from 'react';

export interface StandaloneCheckboxProps extends Omit<MuiCheckboxProps, 'onChange'> {
	name: string;
	label?: string | ReactNode;
	onChange: (event: ChangeEvent<HTMLInputElement>, checked: boolean) => void;
}

export interface CheckboxProps extends Omit<StandaloneCheckboxProps, 'onChange'> {
	onChange?: (event: ChangeEvent<HTMLInputElement>, checked: boolean) => void;
}

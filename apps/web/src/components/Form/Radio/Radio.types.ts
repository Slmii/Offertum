import type { ReactNode } from 'react';

export interface RadioOption {
	value: string;
	label: ReactNode;
	disabled?: boolean;
}

export interface StandaloneRadioGroupProps {
	name: string;
	value: string;
	options: RadioOption[];
	onChange: (value: string) => void;
	label?: ReactNode;
	disabled?: boolean;
	required?: boolean;
	row?: boolean;
}

export interface RadioGroupProps extends Omit<StandaloneRadioGroupProps, 'value' | 'onChange'> {
	onChange?: (value: string) => void;
}

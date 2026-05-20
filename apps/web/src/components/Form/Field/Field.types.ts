import type { TextFieldProps } from '@mui/material/TextField';
import type { SxProps, Theme } from '@mui/material/styles';
import type { JSX } from 'react';

export interface FieldProps extends Omit<TextFieldProps, 'variant' | 'onChange'> {
	name: string;
	label?: string;
	type?: string | 'decimals';
	size?: 'small' | 'medium';
	required?: boolean;
	disabled?: boolean;
	placeholder?: string;
	fullWidth?: boolean;
	readOnly?: boolean;
	onChange?: (value: string) => void;
	endElement?: JSX.Element;
	autoFocus?: boolean;
	helperText?: string;
	multiline?: boolean;
	maxLength?: number;
	sx?: SxProps<Theme>;
	isLoading?: boolean;
	onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
}

export interface UploadFieldProps {
	name: string;
	label: JSX.Element;
	accept?: string;
	multiple?: boolean;
	disabled?: boolean;
	required?: boolean;
	fullWidth?: boolean;
	maxSize?: number;
	onChange?: (attachment: File) => void;
}

export interface StandaloneFieldProps extends Omit<FieldProps, 'onChange' | 'error'> {
	value?: string;
	error?: string;
	onChange?: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
	onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
}

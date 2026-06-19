import type { AppIconName } from '@/components/AppIcon.component';
import type { AutocompleteProps } from '@mui/material/Autocomplete';
import type { SelectChangeEvent } from '@mui/material/Select';
import type { SxProps, Theme } from '@mui/material/styles';
import type { JSX, ReactNode } from 'react';

export interface SelectProps {
	options: Option<string | JSX.Element>[];
	name: string;
	dataTestId?: string;
	label?: string;
	sx?: SxProps<Theme>;
	fullWidth?: boolean;
	onChange?: (value: string) => void;
	placeholder?: string;
	required?: boolean;
	disabled?: boolean;
	autoWidth?: boolean;
	naked?: boolean;
	disableUnderline?: boolean;
	helperText?: string;
	loading?: boolean;
	color?: 'primary' | 'secondary';
	variant?: 'outlined' | 'standard' | 'filled';
	startElement?: JSX.Element;
	endElement?: JSX.Element;
	size?: 'small' | 'medium';
	renderValue?: (value: string) => ReactNode;
}

export interface Option<T = string> {
	id: string | number;
	label: T;
	// Muted second line under the primary label (DS panel-item secondary text).
	secondaryLabel?: ReactNode;
	// Leading icon shown in front of the option (DS panel-item lead).
	icon?: AppIconName;
	disabled?: boolean;
	image?: string;
	groupBy?: string;
	/**
	 * Optional label for the groupBy field, used for display purposes.
	 * If not provided, the groupBy value will be used as the label.
	 */
	groupByLabel?: ReactNode;
}

export interface StandaloneSelectProps extends Omit<SelectProps, 'onChange'> {
	value: string;
	error?: string;
	onChange: (event: SelectChangeEvent<string>, child: React.ReactNode) => void;
}

// Select Autocomplete
interface SelectAutocompleteDefault<
	Option,
	Multiple extends boolean | undefined,
	DisableClearable extends boolean | undefined
> extends Omit<AutocompleteProps<Option, Multiple, DisableClearable, false>, 'renderInput'> {
	name: string;
	label?: string;
	options: Option[];
	required?: boolean;
	disabled?: boolean;
	helperText?: string;
	placeholder?: string;
	fullWidth?: boolean;
	isLoading?: boolean;
	endElement?: JSX.Element;
}

export interface SelectAutocompleteSingleProps extends Omit<
	SelectAutocompleteDefault<Option, true, true>,
	'onChange' | 'defaultValue' | 'renderTags'
> {
	onChange?: (event: React.SyntheticEvent, value: Option | null) => void;
}

export interface SelectAutocompleteMultipleProps<Option> extends Omit<
	SelectAutocompleteDefault<Option, true, true>,
	'onChange' | 'defaultValue' | 'renderTags'
> {
	onChange?: (value: Option[]) => void;
}

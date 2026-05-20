import type { Dayjs } from 'dayjs';

export interface DatePickerProps {
	name: string;
	label?: string;
	disabled?: boolean;
	minDate?: Dayjs;
	maxDate?: Dayjs;
	fullWidth?: boolean;
	format?: string;
	required?: boolean;
	helperText?: string;
	error?: string;
	size?: 'small' | 'medium';
	onChange?: (date: Dayjs | null) => void;
}

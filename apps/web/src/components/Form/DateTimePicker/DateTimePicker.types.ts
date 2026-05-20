import type { Dayjs } from 'dayjs';

export interface DateTimePickerProps {
	name: string;
	label?: string;
	disabled?: boolean;
	minDate?: Dayjs;
	maxDate?: Dayjs;
	fullWidth?: boolean;
	/** dayjs format string for the displayed input. Default `DD-MM-YYYY HH:mm`. */
	format?: string;
	required?: boolean;
	helperText?: string;
	error?: string;
	size?: 'small' | 'medium';
	/** Minute granularity for the time wheel. Default `5` to keep wheels short. */
	minutesStep?: number;
	onChange?: (date: Dayjs | null) => void;
}

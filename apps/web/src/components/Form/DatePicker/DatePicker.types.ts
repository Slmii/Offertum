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
	/** Fired only when the user CONFIRMS a value (closes the picker on desktop,
	 * taps OK on mobile, or clears via the X button). Use this instead of `onChange`
	 * when each intermediate keystroke shouldn't trigger downstream side-effects
	 * (e.g. autosave). */
	onAccept?: (date: Dayjs | null) => void;
}

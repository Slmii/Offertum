import CircularProgress from '@mui/material/CircularProgress';
import FormHelperText from '@mui/material/FormHelperText';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import { cloneElement, type Ref } from 'react';
import { Controller } from 'react-hook-form';
import slugify from 'slugify';
import type { FieldProps, StandaloneFieldProps } from './Field.types';

const textEncoder = new TextEncoder();
const getByteLength = (value: string) => textEncoder.encode(value).length;

/**
 * React 19 ref-as-prop pattern (no `React.forwardRef` wrapper). The `Controller`
 * render path inside `Field` below spreads `field.ref` (from react-hook-form) into
 * this function's props; React 19 forwards `ref` automatically. No `.displayName`
 * line needed — function components show their declared name in devtools.
 */
export function StandaloneField({
	ref,
	label,
	type = 'text',
	size = 'small',
	disabled = false,
	required = false,
	placeholder,
	endElement,
	fullWidth,
	readOnly = false,
	onChange,
	onKeyDown,
	autoFocus = false,
	helperText,
	multiline = false,
	maxLength,
	error,
	sx,
	isLoading,
	slotProps,
	...field
}: StandaloneFieldProps & { ref?: Ref<HTMLInputElement> }) {
	const labelId = `${slugify(field.name)}-label`;

	const trimToMaxBytes = (value: string, maxBytes: number) => {
		if (getByteLength(value) <= maxBytes) {
			return value;
		}

		// Trim by UTF-8 byte length to match backend constraints.
		let trimmedValue = '';
		let currentBytes = 0;

		for (const character of value) {
			const characterBytes = textEncoder.encode(character).length;

			if (currentBytes + characterBytes > maxBytes) {
				break;
			}

			currentBytes += characterBytes;
			trimmedValue += character;
		}

		return trimmedValue;
	};

	const forwardChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
		if (!maxLength) {
			onChange?.(event);
			return;
		}

		const nextValue = event.target.value;
		const trimmedValue = trimToMaxBytes(nextValue, maxLength);

		if (trimmedValue !== nextValue) {
			event.target.value = trimmedValue;
			event.currentTarget.value = trimmedValue;
		}

		onChange?.(event);
	};

	return (
		<TextField
			id={labelId}
			label={label}
			type={type}
			size={size}
			placeholder={placeholder}
			disabled={disabled || isLoading}
			error={Boolean(error)}
			fullWidth={fullWidth}
			multiline={multiline}
			variant='outlined'
			hidden={type === 'hidden'}
			aria-hidden={type === 'hidden'}
			required={required}
			sx={{
				display: type === 'hidden' ? 'none' : undefined,
				...(multiline && {
					'& .MuiOutlinedInput-root': {
						alignItems: 'flex-start',
						height: 'auto'
					}
				}),
				...sx
			}}
			slotProps={{
				...slotProps,
				htmlInput: {
					inputMode: type === 'number' ? 'numeric' : undefined,
					pattern: type === 'number' ? '[0-9]*' : undefined,
					maxLength,
					spellCheck: false,
					...(label ? { 'aria-label': label } : {}),
					...slotProps?.htmlInput
				},
				input: {
					autoComplete: 'off',
					autoFocus,
					readOnly,
					endAdornment:
						isLoading || maxLength || endElement ? (
							<InputAdornment
								position='end'
								sx={{
									mb: multiline ? 'auto' : undefined,
									mt: multiline ? 1 : undefined
								}}
							>
								{isLoading && <CircularProgress size={20} />}
								{endElement && cloneElement(endElement)}
								{maxLength != null && maxLength > 0 && (
									<FormHelperText
										sx={{
											color: 'text.secondary',
											opacity: 0.5
										}}
									>
										{getByteLength(field.value ?? '')} / {maxLength}
									</FormHelperText>
								)}
							</InputAdornment>
						) : null,
					...slotProps?.input
				}
			}}
			inputRef={ref}
			helperText={error || helperText}
			{...field}
			onChange={forwardChange}
			onKeyDown={onKeyDown}
		/>
	);
}

export const Field = (props: FieldProps) => {
	return (
		<Controller
			name={props.name}
			rules={{
				required: props.required
			}}
			render={({ field, fieldState }) => (
				<StandaloneField
					{...props}
					{...field}
					error={fieldState.error?.message || (props.error ? props.helperText : undefined)}
					onChange={e => {
						field.onChange(e);
						props.onChange?.(e.target.value);
					}}
				/>
			)}
		/>
	);
};

import CircularProgress from '@mui/material/CircularProgress';
import FormControl from '@mui/material/FormControl';
import FormHelperText from '@mui/material/FormHelperText';
import InputAdornment from '@mui/material/InputAdornment';
import InputLabel from '@mui/material/InputLabel';
import OutlinedInput from '@mui/material/OutlinedInput';
import { cloneElement, type Ref } from 'react';
import { Controller } from 'react-hook-form';
import slugify from 'slugify';
import type { FieldProps, StandaloneFieldProps } from './Field.types';

const textEncoder = new TextEncoder();
export const getByteLength = (value: string) => textEncoder.encode(value).length;

// Trim by UTF-8 byte length to match backend constraints. Exported so callers that write a
// field's value outside its own `onChange` (e.g. filling a textarea from a preset) can clamp
// through the same rule the field enforces on keystrokes.
export const trimToMaxBytes = (value: string, maxBytes: number) => {
	if (getByteLength(value) <= maxBytes) {
		return value;
	}

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

/**
 * Composed MUI text field: `FormControl` + `InputLabel` + `OutlinedInput` + `FormHelperText`
 * (the pattern from https://mui.com/material-ui/react-text-field/#components) instead of the
 * all-in-one `<TextField>`. This renders the label ABOVE the input — the design-system layout —
 * driven entirely by the theme's `MuiInputLabel` / `MuiOutlinedInput` overrides, so this file
 * carries no styling of its own.
 *
 * React 19 ref-as-prop pattern (no `React.forwardRef` wrapper). The `Controller` render path
 * inside `Field` below spreads `field.ref` (from react-hook-form) into this function's props;
 * React 19 forwards `ref` automatically.
 */
export function StandaloneField({
	ref,
	name,
	value,
	label,
	type = 'text',
	size = 'small',
	disabled = false,
	required = false,
	placeholder,
	startElement,
	endElement,
	fullWidth,
	readOnly = false,
	onChange,
	onBlur,
	onKeyDown,
	autoFocus = false,
	helperText,
	multiline = false,
	minRows,
	maxRows,
	rows,
	maxLength,
	error,
	sx,
	isLoading,
	slotProps
}: StandaloneFieldProps & { ref?: Ref<HTMLInputElement> }) {
	const inputId = `${slugify(name)}-input`;
	const helperId = `${inputId}-helper-text`;
	const helperContent = error || helperText;

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

	// Hidden inputs render without the label / helper scaffolding.
	if (type === 'hidden') {
		return (
			<OutlinedInput
				id={inputId}
				name={name}
				value={value}
				type='hidden'
				inputRef={ref}
				onChange={forwardChange}
				onBlur={onBlur}
				sx={{ display: 'none' }}
			/>
		);
	}

	return (
		<FormControl
			variant='outlined'
			size={size}
			disabled={disabled || isLoading}
			required={required}
			error={Boolean(error)}
			fullWidth={fullWidth}
			sx={sx}
		>
			{label && <InputLabel htmlFor={inputId}>{label}</InputLabel>}
			<OutlinedInput
				id={inputId}
				name={name}
				value={value}
				type={type}
				label={label}
				placeholder={placeholder}
				multiline={multiline}
				minRows={minRows}
				maxRows={maxRows}
				rows={rows}
				readOnly={readOnly}
				autoFocus={autoFocus}
				autoComplete='off'
				inputRef={ref}
				onChange={forwardChange}
				onBlur={onBlur}
				// `FieldProps.onKeyDown` is typed for the root div (TextField legacy); InputBase
				// hangs it on the inner input. Callers only read `e.key`, so the cast is safe.
				onKeyDown={onKeyDown as React.KeyboardEventHandler<HTMLInputElement | HTMLTextAreaElement> | undefined}
				aria-describedby={helperContent ? helperId : undefined}
				inputProps={{
					inputMode: type === 'number' ? 'numeric' : undefined,
					pattern: type === 'number' ? '[0-9]*' : undefined,
					maxLength,
					spellCheck: false,
					...(label ? { 'aria-label': label } : {}),
					...slotProps?.htmlInput
				}}
				startAdornment={
					startElement ? <InputAdornment position='start'>{startElement}</InputAdornment> : null
				}
				endAdornment={
					isLoading || maxLength || endElement ? (
						<InputAdornment
							position='end'
							sx={{
								// Multiline: pin the counter to the top so it sits on the first line
								// (mb:auto pushes it up; no extra top margin beyond the input padding).
								mb: multiline ? 'auto' : undefined,
								alignSelf: multiline ? 'flex-start' : undefined
							}}
						>
							{isLoading && <CircularProgress size={20} />}
							{endElement && cloneElement(endElement)}
							{maxLength != null && maxLength > 0 && (
								<FormHelperText sx={{ color: 'text.secondary', mt: 0 }}>
									{getByteLength(value ?? '')} / {maxLength}
								</FormHelperText>
							)}
						</InputAdornment>
					) : null
				}
			/>
			{helperContent && <FormHelperText id={helperId}>{helperContent}</FormHelperText>}
		</FormControl>
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

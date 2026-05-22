import Autocomplete from '@mui/material/Autocomplete';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import FormControl from '@mui/material/FormControl';
import FormHelperText from '@mui/material/FormHelperText';
import InputAdornment from '@mui/material/InputAdornment';
import InputLabel from '@mui/material/InputLabel';
import ListItemText from '@mui/material/ListItemText';
import ListSubheader, { type ListSubheaderProps } from '@mui/material/ListSubheader';
import MenuItem from '@mui/material/MenuItem';
import MuiSelect from '@mui/material/Select';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { cloneElement, useEffect, useMemo, useState, type JSX, type ReactNode, type Ref } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import slugify from 'slugify';
import type { Option, SelectAutocompleteMultipleProps, SelectProps, StandaloneSelectProps } from './Select.types';

const UNGROUPED = 'Ungrouped';

/**
 * React 19 ref-as-prop pattern (no `React.forwardRef` wrapper). The `Controller`
 * render path inside `Select` below spreads `field.ref` (from react-hook-form) into
 * this function's props; React 19 forwards `ref` automatically.
 */
export function StandaloneSelect({
	ref,
	name,
	value,
	error,
	label,
	options = [],
	onChange,
	required,
	autoWidth,
	fullWidth,
	disabled = false,
	helperText,
	placeholder = 'Select an option',
	dataTestId,
	sx,
	loading = false,
	startElement,
	endElement,
	color,
	size = 'small',
	naked = false,
	variant = 'outlined',
	disableUnderline = false,
	renderValue: renderValueProp
}: StandaloneSelectProps & { ref?: Ref<HTMLInputElement> }) {
	const labelId = `${slugify(name)}-select-label`;
	const slugified = `select-${slugify(name)}`;

	const grouped = useMemo(() => {
		return options.reduce(
			(acc, option) => {
				const group = option.groupBy || UNGROUPED;
				if (!acc[group]) {
					acc[group] = {
						groupByLabel: option.groupByLabel,
						options: []
					};
				}

				acc[group].options.push(option);
				return acc;
			},
			{} as Record<string, { groupByLabel?: ReactNode; options: Option<string | JSX.Element>[] }>
		);
	}, [options]);

	const menuItems =
		Object.keys(grouped).length > 0 ? (
			Object.entries(grouped).flatMap(([key, groupedValue]) => {
				const items = [];

				if (key !== UNGROUPED) {
					items.push(
						<MyListSubheader key={`${key}-subheader`}>{groupedValue.groupByLabel || key}</MyListSubheader>
					);
				}

				items.push(
					...groupedValue.options.map(option => (
						<MenuItem key={option.id} value={option.id} disabled={option.disabled}>
							<ListItemText>{option.label}</ListItemText>
						</MenuItem>
					))
				);

				return items;
			})
		) : (
			<MenuItem disabled>
				<i>No Options</i>
			</MenuItem>
		);

	const renderValue = (rawValue: unknown) => {
		const stringValue = typeof rawValue === 'string' ? rawValue : '';
		if (renderValueProp) {
			return renderValueProp(stringValue);
		}
		const selectedOption = options.find(option => option.id === stringValue);
		if (!stringValue || !selectedOption) {
			return placeholder;
		}
		return selectedOption.label;
	};

	const muiSelect = (
		<MuiSelect
			data-testid={dataTestId}
			error={Boolean(error)}
			id={slugified}
			label={naked ? undefined : label}
			value={value}
			name={name}
			autoWidth={autoWidth}
			required={required}
			variant={variant}
			disableUnderline={disableUnderline}
			disabled={disabled}
			fullWidth={fullWidth && naked}
			slotProps={{
				input: {
					required
				}
			}}
			size={size}
			color={color}
			MenuProps={{
				anchorOrigin: {
					vertical: 'bottom',
					horizontal: 'left'
				},
				transformOrigin: {
					vertical: 'top',
					horizontal: 'left'
				}
			}}
			onChange={onChange}
			inputRef={ref}
			displayEmpty
			renderValue={renderValue}
			startAdornment={
				startElement ? (
					<InputAdornment position='start'>
						{cloneElement(startElement, {
							size: 'medium',
							fontSize: 'medium'
						})}
					</InputAdornment>
				) : null
			}
			endAdornment={
				loading ? (
					<InputAdornment
						position='end'
						sx={{
							padding: 0.5
						}}
					>
						<CircularProgress size={20} />
					</InputAdornment>
				) : endElement ? (
					<InputAdornment position='end'>
						{cloneElement(endElement, {
							size: 'medium',
							fontSize: 'medium'
						})}
					</InputAdornment>
				) : null
			}
			sx={naked ? sx : undefined}
		>
			{menuItems}
		</MuiSelect>
	);

	// `naked` skips the FormControl/InputLabel/helper-text scaffolding so callers can
	// render compact pill/chip-shaped status selectors in list rows where the wrapper
	// chrome would conflict with the visual treatment. Loading + label + helperText
	// only apply in the wrapped (default) form — naked is data-entry's "raw" mode.
	if (naked) {
		return muiSelect;
	}

	return (
		<FormControl fullWidth={fullWidth} disabled={disabled} required={required} sx={sx}>
			{label && (
				<InputLabel required={required} htmlFor={labelId}>
					{label}
				</InputLabel>
			)}
			{loading ? <Skeleton height={54} variant='rounded' /> : muiSelect}
			{helperText && <FormHelperText>{helperText}</FormHelperText>}
			{error && <FormHelperText error>{error}</FormHelperText>}
		</FormControl>
	);
}

export const Select = (props: SelectProps) => {
	return (
		<Controller
			name={props.name}
			rules={{
				required: props.required
			}}
			render={({ field, fieldState }) => {
				return (
					<StandaloneSelect
						{...props}
						{...field}
						error={fieldState.error?.message}
						onChange={e => {
							field.onChange(e);
							props.onChange?.(e.target.value as string);
						}}
					/>
				);
			}}
		/>
	);
};

export const SelectAutocompleteMultiple = ({
	name,
	label,
	placeholder,
	options = [],
	onChange,
	required,
	disabled,
	fullWidth,
	isLoading,
	endElement,
	helperText,
	...rest
}: SelectAutocompleteMultipleProps<Option>) => {
	const { control, setValue: setFormValue, getValues } = useFormContext();
	const [values, setValues] = useState<Option[]>([]);
	const formValues = getValues(name) as Option[];

	useEffect(() => {
		if (options.length > 0) {
			const defaultFormValues = getValues(name) as Option[];

			// Find the options that match the defaultValues in the formContext
			// and prefill those in the input field as a `Chip` tag. Legitimate
			// external → local mirror (the buffered-input pattern, CLAUDE.md #12).
			const foundOptions = options.filter(option => defaultFormValues?.find(value => value.id === option.id));
			// eslint-disable-next-line react-hooks/set-state-in-effect
			setValues(foundOptions);
		}
	}, [name, options, getValues]);

	useEffect(() => {
		// Same mirror pattern: react-hook-form's `formValues` (external source of
		// truth) → local `values` (drives the rendered Chip list).
		// eslint-disable-next-line react-hooks/set-state-in-effect
		setValues(formValues);
	}, [formValues, setValues]);

	const labelId = `${slugify(name)}-select-autocomplete-multiple`;

	return (
		<Controller
			name={name}
			control={control}
			defaultValue={getValues(name)}
			rules={{ required }}
			render={({ field, fieldState }) => (
				<Autocomplete
					{...rest}
					multiple
					disableCloseOnSelect
					id={labelId}
					value={values}
					options={options}
					isOptionEqualToValue={(option, value) => option.id === value.id}
					getOptionLabel={option => option.label}
					getOptionDisabled={option => option.disabled ?? false}
					disabled={isLoading || disabled}
					fullWidth={fullWidth}
					disableClearable
					renderOption={(props, option) => {
						const { key, ...optionProps } = props;

						return (
							<li key={key} {...optionProps}>
								{option.label}
							</li>
						);
					}}
					noOptionsText={<i>No Options</i>}
					renderInput={params => (
						<FormControl fullWidth={fullWidth} disabled={disabled} required={required}>
							{label && (
								<InputLabel shrink required={required} htmlFor={labelId}>
									{label}
								</InputLabel>
							)}
							<TextField
								{...params}
								id={labelId}
								placeholder={placeholder}
								disabled={disabled || isLoading}
								error={Boolean(fieldState.error)}
								fullWidth={fullWidth}
								variant='outlined'
								required={required}
								sx={{
									'label + &': {
										marginTop: theme => theme.spacing(3)
									}
								}}
								slotProps={{
									input: {
										...params.slotProps.input,
										autoComplete: 'off',
										sx: {
											'& input[type=number]': {
												MozAppearance: 'textfield'
											},
											'& input[type=number]::-webkit-outer-spin-button': {
												WebkitAppearance: 'none',
												margin: 0
											},
											'& input[type=number]::-webkit-inner-spin-button': {
												WebkitAppearance: 'none',
												margin: 0
											}
										},
										endAdornment: isLoading ? (
											<InputAdornment
												position='end'
												sx={{
													padding: 0.5
												}}
											>
												<CircularProgress size={20} />
											</InputAdornment>
										) : endElement ? (
											<InputAdornment position='end'>
												{cloneElement(endElement, {
													size: 'small',
													fontSize: 'small'
												})}
											</InputAdornment>
										) : (
											params.slotProps.input.endAdornment
										)
									}
								}}
								helperText={helperText || fieldState.error?.message}
								onKeyDown={event => {
									if (event.key === 'Backspace' || event.key === 'Delete') {
										event.stopPropagation();
									}
								}}
							/>
							{values.length > 0 && (
								<Stack
									direction='row'
									spacing={1}
									sx={{ mt: 1, flexWrap: 'wrap', alignItems: 'center' }}
								>
									{values.map(option => (
										<Chip
											key={option.id}
											label={option.label}
											disabled={disabled || isLoading}
											onDelete={() => {
												const next = values.filter(value => value.id !== option.id);
												setValues(next);
												setFormValue(name, next);
												onChange?.(next);
											}}
										/>
									))}
								</Stack>
							)}
						</FormControl>
					)}
					onChange={(_e, values) => {
						// Execute custom onChange passed as a prop
						onChange?.(values);
						// Set value in the Autocomplete component
						setValues(values);
						// Set value in the formContext
						setFormValue(name, values);
					}}
					onBlur={field.onBlur}
					onInputChange={(_e, value) => {
						if (!value) {
							// If no value if provided then pass an empty array to the custom onChange
							onChange?.([]);
						}
					}}
				/>
			)}
		/>
	);
};

function MyListSubheader(props: ListSubheaderProps) {
	return <ListSubheader {...props} />;
}
MyListSubheader.muiSkipListHighlight = true;

import type { CSSProperties, JSX, ReactNode, Ref } from 'react';
import type { DefaultValues, FieldValues, Mode, SubmitHandler, UseFormReturn } from 'react-hook-form';
import type { ZodType, ZodTypeDef } from 'zod';
import type { $ZodTypeInternals } from 'zod/v4/core';

export interface FormNavigationPromptProps {
	message: string;
	isOpen: boolean;
	onConfirm: () => void;
	onCancel: () => void;
}

export interface FormProps<T extends FieldValues> {
	id?: string;
	/**
	 * Function to execute on form submit
	 */
	action: SubmitHandler<T>;
	/**
	 * Validator schema. Either a joi or yup schema.
	 */
	schema?: ZodType<T, ZodTypeDef, $ZodTypeInternals<T, unknown>>;
	/**
	 * Default values in a form
	 */
	defaultValues: DefaultValues<T> | (() => DefaultValues<T>);
	/**
	 * Option to configure the validation before onSubmit event
	 */
	mode?: Mode;
	/**
	 * Render all JSX elements with this prop. Using this prop will make react hook form props
	 * available as parameters to use, example `getValues, formState`.
	 *
	 * Using this prop will also ignore direct children,
	 */
	render?: (props: UseFormReturn<T, unknown, T>) => JSX.Element;
	/**
	 * Optional ref. This is necessary if you want to submit the form outside the form component
	 * itself, example a Dialog component.
	 */
	formRef?: Ref<HTMLFormElement>;
	children?: ReactNode;
	noValidate?: boolean;
	style?: CSSProperties;
	isDisabled?: boolean;
}

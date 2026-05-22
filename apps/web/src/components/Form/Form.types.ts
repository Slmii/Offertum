import type { CSSProperties, JSX, ReactNode, Ref } from 'react';
import type { DefaultValues, FieldValues, Mode, SubmitHandler, UseFormReturn } from 'react-hook-form';
import type { ZodType } from 'zod';

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
	 * Zod schema used as the resolver. Single-generic typing — Zod v3 returns
	 * `ZodObject<...>` which doesn't satisfy v4's multi-generic `ZodType<T, ZodTypeDef, ...>`,
	 * so we accept any schema whose parsed output matches `T`.
	 */
	schema?: ZodType<T>;
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

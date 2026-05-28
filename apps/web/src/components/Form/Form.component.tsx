import { zodResolver } from '@hookform/resolvers/zod';
import FormGroup from '@mui/material/FormGroup';
import { type FieldValues, FormProvider, type SubmitHandler, useForm } from 'react-hook-form';
import type { FormProps } from './Form.types';

export function Form<T extends FieldValues>({
	id,
	children,
	action,
	schema,
	defaultValues,
	mode = 'all',
	render,
	formRef,
	noValidate = true,
	style,
	isDisabled
}: FormProps<T>) {
	const methods = useForm({
		// @ts-expect-error Type issue with zod resolver
		resolver: schema ? zodResolver(schema) : undefined,
		defaultValues: typeof defaultValues === 'function' ? defaultValues() : defaultValues,
		mode
	});

	return (
		<FormProvider {...methods}>
			<form
				id={id}
				noValidate={noValidate}
				onSubmit={methods.handleSubmit(action as SubmitHandler<Record<string, unknown>>)}
				ref={formRef}
				style={style}
			>
				<FormGroup
					sx={{
						flexWrap: 'nowrap',
						display: 'flex',
						flexDirection: 'column',
						height: '100%',
						gap: 2,
						opacity: isDisabled ? 0.5 : 1,
						pointerEvents: isDisabled ? 'none' : 'auto'
					}}
				>
					{render ? render(methods) : children}
				</FormGroup>
			</form>
		</FormProvider>
	);
}

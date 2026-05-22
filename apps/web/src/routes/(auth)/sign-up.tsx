import { Field } from '@/components/Form/Field/Field.component';
import { Form } from '@/components/Form/Form.component';
import { WrapperApiError } from '@/lib/api/client';
import { useSignUp } from '@/lib/queries/auth.queries';
import { type SignUpForm, SignUpSchema } from '@/lib/schemas/auth.schema';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { createFileRoute, Link as RouterLink, useNavigate } from '@tanstack/react-router';

export const Route = createFileRoute('/(auth)/sign-up')({
	component: SignUpPage
});

function SignUpPage() {
	const navigate = useNavigate();
	const signUp = useSignUp();

	const onSubmit = async ({ email, companyName }: SignUpForm) => {
		await signUp.mutateAsync({ email, companyName });
		navigate({ to: '/verify-request', search: { email } });
	};

	const errorMessage =
		signUp.error instanceof WrapperApiError
			? signUp.error.message
			: signUp.error
				? 'Something went wrong. Please try again.'
				: null;

	return (
		<Container maxWidth='xs' sx={{ py: 8 }}>
			<Paper variant='outlined' sx={{ p: 5 }}>
				<Typography variant='h1' sx={{ fontSize: 28, mb: 1 }}>
					Create your account
				</Typography>
				<Typography variant='body2' color='text.secondary' sx={{ mb: 3 }}>
					Start a 14-day free trial. No credit card required.
				</Typography>

				<Form<SignUpForm>
					action={onSubmit}
					schema={SignUpSchema}
					defaultValues={{ email: '', companyName: '' }}
				>
					<Field name='companyName' label='Company name' autoFocus fullWidth />
					<Field name='email' type='email' label='Work email' fullWidth />

					{errorMessage && <Alert severity='error'>{errorMessage}</Alert>}

					<Button
						type='submit'
						variant='contained'
						fullWidth
						size='large'
						disabled={signUp.isPending}
						sx={{ mt: 1 }}
					>
						{signUp.isPending ? 'Creating account...' : 'Create account'}
					</Button>
				</Form>

				<Typography variant='body2' color='text.secondary' sx={{ mt: 3, textAlign: 'center' }}>
					Already have an account?{' '}
					<Link component={RouterLink} to='/sign-in'>
						Sign in
					</Link>
				</Typography>

				<Typography
					variant='caption'
					color='text.secondary'
					sx={{ display: 'block', mt: 2, textAlign: 'center' }}
				>
					Joining a colleague's team? Ask your owner to invite you from the Team page instead.
				</Typography>
			</Paper>
		</Container>
	);
}

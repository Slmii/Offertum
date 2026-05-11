import { useSignInWithEmail } from '@/lib/auth/queries';
import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const SignInSchema = z.object({
	email: z.string().email('Geef een geldig e-mailadres op')
});
type SignInForm = z.infer<typeof SignInSchema>;

export const Route = createFileRoute('/sign-in')({
	component: SignInPage
});

function SignInPage() {
	const navigate = useNavigate();
	const signIn = useSignInWithEmail();

	const form = useForm<SignInForm>({
		resolver: zodResolver(SignInSchema),
		defaultValues: { email: '' }
	});

	const onSubmit = form.handleSubmit(async ({ email }) => {
		await signIn.mutateAsync(email);
		navigate({ to: '/verify-request', search: { email } });
	});

	return (
		<Container maxWidth='xs' sx={{ py: 8 }}>
			<Paper variant='outlined' sx={{ p: 5 }}>
				<Typography variant='h1' sx={{ fontSize: 28, mb: 1 }}>
					Inloggen
				</Typography>
				<Typography variant='body2' color='text.secondary' sx={{ mb: 3 }}>
					Vul je e-mailadres in. Je krijgt een magic link toegestuurd.
				</Typography>

				<Box component='form' onSubmit={onSubmit} noValidate>
					<TextField
						{...form.register('email')}
						type='email'
						label='E-mailadres'
						autoComplete='email'
						autoFocus
						fullWidth
						margin='normal'
						error={!!form.formState.errors.email}
						helperText={form.formState.errors.email?.message}
					/>

					{signIn.isError && (
						<Alert severity='error' sx={{ mt: 2 }}>
							Er ging iets mis. Probeer het opnieuw.
						</Alert>
					)}

					<Button
						type='submit'
						variant='contained'
						fullWidth
						size='large'
						disabled={signIn.isPending}
						sx={{ mt: 3 }}
					>
						{signIn.isPending ? 'Bezig...' : 'Magic link sturen'}
					</Button>
				</Box>
			</Paper>
		</Container>
	);
}

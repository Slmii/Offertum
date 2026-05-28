import { Field } from '@/components/Form/Field/Field.component';
import { Form } from '@/components/Form/Form.component';
import { signInWithOAuth, useSignInWithEmail } from '@/lib/queries/auth.queries';
import { type SignInForm, SignInSchema } from '@/lib/schemas/auth.schema';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { OAuthProviderId } from '@offertum/shared';
import { createFileRoute, redirect, Link as RouterLink, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

export const Route = createFileRoute('/(auth)/sign-in')({
	beforeLoad: ({ context }) => {
		if (context.session) {
			throw redirect({ to: '/' });
		}
	},
	component: SignInPage
});

function SignInPage() {
	const [loadingProvider, setLoadingProvider] = useState<OAuthProviderId | null>(null);

	const navigate = useNavigate();
	const signIn = useSignInWithEmail();

	const onSubmit = async ({ email }: SignInForm) => {
		await signIn.mutateAsync(email);
		// Imperative navigate is correct here: it's inside an async submit handler,
		// not render. The post-magic-link-request redirect to /verify-request is a
		// user-action effect; react-doctor's static check can't see the handler scope.
		void navigate({ to: '/verify-request', search: { email } });
	};

	const handleOAuth = async (providerId: OAuthProviderId) => {
		setLoadingProvider(providerId);
		await signInWithOAuth(providerId);
	};

	const oauthBusy = loadingProvider !== null;

	return (
		<Container maxWidth='xs' sx={{ py: 8 }}>
			<Paper variant='outlined' sx={{ p: 5 }}>
				<Typography variant='h1' sx={{ fontSize: 28, mb: 1 }}>
					Sign in
				</Typography>
				<Typography variant='body2' color='text.secondary' sx={{ mb: 3 }}>
					Continue with Google or Microsoft, or use a magic link.
				</Typography>

				<Stack spacing={1.5}>
					<Button
						variant='outlined'
						fullWidth
						size='large'
						disabled={oauthBusy || signIn.isPending}
						onClick={() => handleOAuth('google')}
					>
						{loadingProvider === 'google' ? 'Redirecting...' : 'Sign in with Google'}
					</Button>
					<Button
						variant='outlined'
						fullWidth
						size='large'
						disabled={oauthBusy || signIn.isPending}
						onClick={() => handleOAuth('microsoft-entra-id')}
					>
						{loadingProvider === 'microsoft-entra-id' ? 'Redirecting...' : 'Sign in with Microsoft'}
					</Button>
				</Stack>

				<Divider sx={{ my: 3 }}>
					<Typography variant='caption' color='text.secondary'>
						or use email
					</Typography>
				</Divider>

				<Form<SignInForm>
					action={onSubmit}
					schema={SignInSchema}
					defaultValues={{ email: '' }}
					isDisabled={oauthBusy}
				>
					<Field name='email' type='email' label='Email address' fullWidth />

					{signIn.isError && <Alert severity='error'>Something went wrong. Please try again.</Alert>}

					<Button
						type='submit'
						variant='contained'
						fullWidth
						size='large'
						disabled={signIn.isPending || oauthBusy}
						sx={{ mt: 1 }}
					>
						{signIn.isPending ? 'Sending...' : 'Send magic link'}
					</Button>
				</Form>

				<Typography variant='body2' color='text.secondary' sx={{ mt: 3, textAlign: 'center' }}>
					Don't have an account?{' '}
					<Link component={RouterLink} to='/sign-up'>
						Create one
					</Link>
				</Typography>
			</Paper>
		</Container>
	);
}

import { Banner } from '@/components/Banner.component';
import { Field } from '@/components/Form/Field/Field.component';
import { Form } from '@/components/Form/Form.component';
import { BodySmall, H1 } from '@/components/Text.component';
import { signInWithOAuth, useSignInWithEmail } from '@/lib/queries/auth.queries';
import { type SignInForm, SignInSchema } from '@/lib/schemas/auth.schema';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
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
				<H1 sx={{ mb: 1 }}>Sign in</H1>
				<BodySmall color='textSecondary' sx={{ display: 'block', mb: 3 }}>
					Continue with Google or Microsoft, or use a magic link.
				</BodySmall>

				<Stack useFlexGap spacing={1.5}>
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
					<BodySmall color='textSecondary'>or</BodySmall>
				</Divider>

				<Form<SignInForm>
					action={onSubmit}
					schema={SignInSchema}
					defaultValues={{ email: '' }}
					isDisabled={oauthBusy}
				>
					<Field name='email' type='email' label='Email address' fullWidth />

					{signIn.isError && <Banner tone='error'>Something went wrong. Please try again.</Banner>}

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

				<BodySmall color='textSecondary' sx={{ display: 'block', mt: 3, textAlign: 'center' }}>
					Don't have an account?{' '}
					<Link component={RouterLink} to='/sign-up'>
						Create one
					</Link>
				</BodySmall>
			</Paper>
		</Container>
	);
}

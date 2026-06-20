import { Banner } from '@/components/Banner.component';
import { BodySmall } from '@/components/Text.component';
import { useAcceptInvitation } from '@/lib/queries/invitation.queries';
import { AcceptInviteSearchSchema } from '@/lib/schemas/auth.schema';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';

export const Route = createFileRoute('/(auth)/accept-invite')({
	validateSearch: AcceptInviteSearchSchema,
	component: AcceptInvitePage
});

function AcceptInvitePage() {
	const { token } = Route.useSearch();

	const accept = useAcceptInvitation();

	const hasSubmittedRef = useRef(false);
	useEffect(() => {
		if (hasSubmittedRef.current) {
			return;
		}

		hasSubmittedRef.current = true;

		accept.mutate(token, {
			// Hard navigation, not router.navigate. The accept response sets the Auth.js
			// session cookie inline; we need a full page reload so SSR re-runs with the
			// new cookie attached and the home page renders authenticated on the server.
			// Client-side `router.navigate` would re-use the hydrated query cache (which
			// holds the pre-login `null` session) and bounce the user to /sign-in.
			onSuccess: () => {
				window.location.href = '/';
			}
		});

		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [token]);

	return (
		<Container maxWidth='sm' sx={{ py: 6 }}>
			<Paper variant='outlined' sx={{ p: 5 }}>
				{(accept.isPending || accept.isSuccess) && (
					<Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
						<CircularProgress size={32} />
						<BodySmall color='text.secondary'>Accepting invitation…</BodySmall>
					</Box>
				)}

				{accept.isError && <InviteError error={accept.error.message} />}
			</Paper>
		</Container>
	);
}

function InviteError({ error }: { error: string }) {
	return (
		<Banner tone='error' sx={{ mb: 2 }}>
			{error}
		</Banner>
	);
}

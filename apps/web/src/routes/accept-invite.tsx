import { api, ApiError } from '@/lib/api/client';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useMutation } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { z } from 'zod';

interface AcceptInvitationResponse {
	userId: string;
	email: string;
	organizationId: string;
	organizationName: string;
}

const SearchSchema = z.object({
	token: z.string().min(1)
});

export const Route = createFileRoute('/accept-invite')({
	validateSearch: SearchSchema,
	component: AcceptInvitePage
});

function AcceptInvitePage() {
	const { token } = Route.useSearch();
	const navigate = useNavigate();

	const accept = useMutation({
		mutationFn: async () => {
			return api<AcceptInvitationResponse>('/api/invitations/accept', {
				method: 'POST',
				body: { token }
			});
		}
	});

	// Fire the accept call once on mount.
	useEffect(() => {
		accept.mutate();
		// Intentionally only on mount.
	}, []);

	return (
		<Container maxWidth='xs' sx={{ py: 8 }}>
			<Paper variant='outlined' sx={{ p: 5 }}>
				{accept.isPending && (
					<Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
						<CircularProgress size={32} />
						<Typography variant='body2' color='text.secondary'>
							Bezig met accepteren...
						</Typography>
					</Box>
				)}

				{accept.isError && <InviteError error={accept.error} />}

				{accept.isSuccess && accept.data && (
					<Box>
						<Typography variant='h1' sx={{ fontSize: 28, mb: 1 }}>
							Welkom bij {accept.data.organizationName}
						</Typography>
						<Typography variant='body1' color='text.secondary' sx={{ mb: 3 }}>
							Je account is aangemaakt. Log nu in om verder te gaan.
						</Typography>
						<Button variant='contained' size='large' fullWidth onClick={() => navigate({ to: '/sign-in' })}>
							Inloggen
						</Button>
					</Box>
				)}
			</Paper>
		</Container>
	);
}

function InviteError({ error }: { error: unknown }) {
	const status = error instanceof ApiError ? error.status : 0;

	const message =
		status === 404
			? 'Deze uitnodiging bestaat niet.'
			: status === 409
				? 'Deze uitnodiging is al geaccepteerd.'
				: status === 410
					? 'Deze uitnodiging is verlopen.'
					: 'Er ging iets mis bij het accepteren van de uitnodiging.';

	return (
		<Alert severity='error' sx={{ mb: 2 }}>
			{message}
		</Alert>
	);
}

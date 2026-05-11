import { useAcceptInvitation } from '@/lib/queries/invitation';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { z } from 'zod';

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

	const accept = useAcceptInvitation();

	// Fire the accept call once on mount.
	useEffect(() => {
		accept.mutateAsync(token);
	}, []);

	return (
		<Container maxWidth='xs' sx={{ py: 8 }}>
			<Paper variant='outlined' sx={{ p: 5 }}>
				{accept.isPending && (
					<Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
						<CircularProgress size={32} />
						<Typography variant='body2' color='text.secondary'>
							Accepting invitation...
						</Typography>
					</Box>
				)}

				{accept.isError && <InviteError error={accept.error.message} />}

				{accept.isSuccess && accept.data && (
					<Box>
						<Typography variant='h1' sx={{ fontSize: 28, mb: 1 }}>
							Welcome to {accept.data.organizationName}
						</Typography>
						<Typography variant='body1' color='text.secondary' sx={{ mb: 3 }}>
							Your account has been created. Sign in to continue.
						</Typography>
						<Button variant='contained' size='large' fullWidth onClick={() => navigate({ to: '/sign-in' })}>
							Sign in
						</Button>
					</Box>
				)}
			</Paper>
		</Container>
	);
}

function InviteError({ error }: { error: string }) {
	return (
		<Alert severity='error' sx={{ mb: 2 }}>
			{error}
		</Alert>
	);
}

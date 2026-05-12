import { billingStatusQueryOptions, type BillingState } from '@/lib/queries/billing.queries';
import {
	EmailKeys,
	gmailMessagesQueryOptions,
	gmailStatusQueryOptions,
	useDisconnectGmail,
	type GmailMessage
} from '@/lib/queries/email.queries';
import { myMembershipQueryOptions } from '@/lib/queries/team.queries';
import { EmailSettingsSearchSchema } from '@/lib/schemas/email.schema';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import dayjs from 'dayjs';
import { useEffect } from 'react';

export const Route = createFileRoute('/(app)/settings/email')({
	validateSearch: EmailSettingsSearchSchema,
	loader: ({ context }) =>
		Promise.all([
			context.queryClient.ensureQueryData(gmailStatusQueryOptions),
			context.queryClient.ensureQueryData(gmailMessagesQueryOptions),
			context.queryClient.ensureQueryData(billingStatusQueryOptions),
			context.queryClient.ensureQueryData(myMembershipQueryOptions)
		]),
	component: EmailSettingsPage
});

function EmailSettingsPage() {
	const navigate = useNavigate();
	const search = Route.useSearch();
	const queryClient = useQueryClient();
	const { data: status } = useSuspenseQuery(gmailStatusQueryOptions);
	const { data: messages } = useSuspenseQuery(gmailMessagesQueryOptions);
	const { data: billing } = useSuspenseQuery(billingStatusQueryOptions);
	const { data: me } = useSuspenseQuery(myMembershipQueryOptions);
	const disconnect = useDisconnectGmail();

	// Reconcile the parallel-query race: `status` and `messages` fire side-by-side in the
	// loader. If Gmail revoked our token between the two responses, `messages` returns
	// 404 (`disconnected: true`) and self-heals the row, but `status` already answered
	// `connected: true` based on the pre-deletion DB state. Trust the messages signal —
	// the row is genuinely gone — AND invalidate the cached status so it refetches.
	const isConnected = status.connected && !messages.disconnected;
	useEffect(() => {
		if (messages.disconnected && status.connected) {
			void queryClient.invalidateQueries({ queryKey: EmailKeys.gmailStatus });
		}
	}, [messages.disconnected, status.connected, queryClient]);

	// Mirror the API's EntitlementGuard set: connect/disconnect will 402 outside this set.
	// Disable the Connect/Reconnect buttons proactively rather than letting the user click
	// through to a 402 → /billing redirect. Status + messages reads are NOT gated, so
	// already-connected users still see their mailbox and recent messages.
	const billingEntitled = billing.state === 'trialing' || billing.state === 'active' || billing.state === 'past_due';
	const isOwner = me.role === 'OWNER';

	const handleConnect = () => {
		// Top-level navigation to the API — Express sets the state cookie + redirects to
		// Google. We don't fetch this via the api() client because the response is an HTTP
		// 302, which fetch handles transparently and we'd lose the redirect target.
		window.location.href = '/api/email/gmail/connect';
	};

	return (
		<Container maxWidth='sm' sx={{ py: 8 }}>
			<Paper variant='outlined' sx={{ p: 5 }}>
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
					<Typography variant='h1' sx={{ fontSize: 28 }}>
						Your mailbox
					</Typography>
					<Button size='small' variant='text' onClick={() => navigate({ to: '/' })}>
						← Home
					</Button>
				</Box>
				<Typography variant='body2' color='text.secondary' sx={{ mb: 4 }}>
					Connect your own inbox so Quoteom can read incoming quote requests and send replies on your behalf.
					Each teammate connects their own mailbox.
				</Typography>

				{isConnected && search.connected === '1' && (
					<Alert severity='success' sx={{ mb: 3 }}>
						Mailbox connected. Most recent messages should appear below within a few seconds.
					</Alert>
				)}

				{search.error && (
					<Alert severity='error' sx={{ mb: 3 }}>
						Google returned an error: <strong>{search.error}</strong>. Try connecting again.
					</Alert>
				)}

				{!billingEntitled && (
					<Alert
						severity='warning'
						sx={{ mb: 3 }}
						action={
							isOwner ? (
								<Button color='inherit' size='small' onClick={() => navigate({ to: '/billing' })}>
									Subscribe
								</Button>
							) : undefined
						}
					>
						{billingBlockedCopy(billing.state, isOwner)}
					</Alert>
				)}

				<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
					<Typography variant='overline' color='text.secondary'>
						Gmail
					</Typography>
					{isConnected ? (
						<Chip size='small' color='success' label='Connected' />
					) : (
						<Chip size='small' color='default' label='Not connected' />
					)}
				</Box>

				{isConnected ? (
					<>
						<Typography variant='body1' sx={{ mb: 0.5 }}>
							Connected as <strong>{status.email}</strong>
						</Typography>
						{status.connectedAt && (
							<Typography variant='body2' color='text.secondary'>
								Linked on {dayjs(status.connectedAt).format('D MMM YYYY')}
							</Typography>
						)}

						<Box sx={{ display: 'flex', gap: 2, mt: 3 }}>
							<Button
								variant='outlined'
								color='error'
								onClick={() => disconnect.mutate()}
								disabled={disconnect.isPending || !billingEntitled}
							>
								{disconnect.isPending ? 'Disconnecting...' : 'Disconnect'}
							</Button>
							<Button variant='outlined' onClick={handleConnect} disabled={!billingEntitled}>
								Reconnect
							</Button>
						</Box>
					</>
				) : (
					<>
						<Typography variant='body1' sx={{ mb: 2 }}>
							No mailbox connected yet.
						</Typography>
						<Button variant='contained' size='large' onClick={handleConnect} disabled={!billingEntitled}>
							Connect Gmail
						</Button>
					</>
				)}

				{isConnected && (
					<>
						<Divider sx={{ my: 4 }} />
						<Typography variant='h2' sx={{ fontSize: 18, mb: 2 }}>
							Recent messages
						</Typography>
						{messages.messages.length === 0 ? (
							<Typography variant='body2' color='text.secondary'>
								No messages found in the connected mailbox.
							</Typography>
						) : (
							<List dense disablePadding>
								{messages.messages.map(m => (
									<MessageRow key={m.id} message={m} />
								))}
							</List>
						)}
						<Typography variant='caption' color='text.secondary' sx={{ display: 'block', mt: 2 }}>
							Smoke-test view of the {messages.messages.length} most recent messages — proves the OAuth
							handshake works. Full inbox sync arrives in week 3.4.
						</Typography>
					</>
				)}

				<Typography variant='caption' color='text.secondary' sx={{ display: 'block', mt: 5 }}>
					Quoteom requests read + send scopes only. We never read messages outside your offerteaanvraag flow,
					and the tokens are encrypted at rest.
				</Typography>
			</Paper>
		</Container>
	);
}

function MessageRow({ message }: { message: GmailMessage }) {
	return (
		<ListItem disableGutters divider sx={{ py: 1 }}>
			<ListItemText
				primary={message.subject ?? '(no subject)'}
				secondary={
					<>
						<Typography component='span' variant='body2' color='text.secondary'>
							{message.from ?? 'unknown sender'}
						</Typography>
						{' · '}
						<Typography component='span' variant='caption' color='text.secondary'>
							{dayjs(message.internalDate).format('D MMM YYYY HH:mm')}
						</Typography>
					</>
				}
			/>
		</ListItem>
	);
}

/**
 * Copy shown when the org's billing state blocks new Gmail connections. Owners get a
 * direct "Subscribe" prompt; non-owners are told to nudge the owner since they can't
 * fix billing themselves.
 */
function billingBlockedCopy(state: BillingState, isOwner: boolean): string {
	const ownerSuffix = isOwner ? 'Subscribe to connect a mailbox.' : 'Ask your owner to subscribe.';
	switch (state) {
		case 'none':
			return `You haven't started your trial yet. ${ownerSuffix}`;
		case 'canceled':
			return `Your subscription has been canceled. ${ownerSuffix}`;
		case 'unpaid':
			return `Your subscription is unpaid — update your payment method first. ${ownerSuffix}`;
		case 'paused':
			return `Your subscription is paused. ${isOwner ? 'Resume it to connect a mailbox.' : 'Ask your owner to resume the subscription.'}`;
		case 'incomplete':
			return `Subscription setup is incomplete. ${isOwner ? 'Finish checkout to connect a mailbox.' : 'Ask your owner to finish checkout.'}`;
		case 'incomplete_expired':
			return `Subscription setup expired. ${ownerSuffix}`;
		default:
			return `Your subscription is inactive. ${ownerSuffix}`;
	}
}

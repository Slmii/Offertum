import { SectionError } from '@/components/SectionError.component';
import { BackToHomeButton } from '@/components/BackToHomeButton.component';
import { Field } from '@/components/Form/Field/Field.component';
import { Form } from '@/components/Form/Form.component';
import { Select } from '@/components/Form/Select/Select.component';
import { WrapperApiError } from '@/lib/api/client';
import { billingStatusQueryOptions } from '@/lib/queries/billing.queries';
import {
	invitationsQueryOptions,
	membershipsQueryOptions,
	myMembershipQueryOptions,
	useCreateInvitation,
	useRemoveMember,
	useRevokeInvitation
} from '@/lib/queries/team.queries';
import { TeamInviteSchema, type TeamInviteForm } from '@/lib/schemas/team-invite.schema';
import { toReadableDate } from '@/lib/utils/date.utils';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { BillingState, MembershipRole } from '@offertum/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useWatch } from 'react-hook-form';

// OWNER is omitted intentionally — every org has exactly one owner, set at org creation.
// Ownership transfer (if we ever build it) is a separate flow, not via invitation.
const ROLE_OPTIONS: ReadonlyArray<{ value: MembershipRole; label: string; hint: string }> = [
	{ value: 'MEMBER', label: 'Member', hint: 'Standard teammate — can use the app day-to-day.' },
	{ value: 'EXTERNAL', label: 'External', hint: 'Limited access for contractors or clients.' }
];

export const Route = createFileRoute('/(app)/team')({
	loader: ({ context }) => {
		return Promise.all([
			context.queryClient.ensureQueryData(membershipsQueryOptions),
			context.queryClient.ensureQueryData(invitationsQueryOptions),
			context.queryClient.ensureQueryData(billingStatusQueryOptions),
			context.queryClient.ensureQueryData(myMembershipQueryOptions)
		]);
	},
	component: TeamPage,
	errorComponent: SectionError
});

function TeamPage() {
	const { data: memberships } = useSuspenseQuery(membershipsQueryOptions);
	const { data: invitations } = useSuspenseQuery(invitationsQueryOptions);
	const { data: status } = useSuspenseQuery(billingStatusQueryOptions);
	const { data: me } = useSuspenseQuery(myMembershipQueryOptions);

	const navigate = useNavigate();
	const createInvitation = useCreateInvitation();
	const revokeInvitation = useRevokeInvitation();
	const removeMember = useRemoveMember();

	const isOwner = me.role === 'OWNER';
	const isTrial = status.state === 'trialing';
	const seatsTaken = memberships.length + invitations.length;
	const trialCapReached = isTrial && seatsTaken >= status.seats.included;
	// Mirror the API's EntitlementGuard set. Any state outside this list will 402 at
	// submission time, so disable the invite form proactively. A brand-new org with
	// state='none' falls into the disabled branch — they need to Checkout first.
	const billingEntitled = status.state === 'trialing' || status.state === 'active' || status.state === 'past_due';

	const inviteError = createInvitation.error;
	const isTrialSeatLimit = inviteError instanceof WrapperApiError && inviteError.apiCode === 'trial_seat_limit';

	return (
		<Container maxWidth='sm' sx={{ py: 8 }}>
			<Paper variant='outlined' sx={{ p: 5 }}>
				<Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 1 }}>
					<Typography variant='h1' sx={{ fontSize: 28 }}>
						Team
					</Typography>
					<BackToHomeButton />
				</Box>
				<Typography variant='body2' color='text.secondary' sx={{ mb: 4 }}>
					{seatsTaken} of {status.seats.included} {isTrial ? 'seats during trial' : 'included seats'}
					{!isTrial && seatsTaken > status.seats.included
						? ` (${seatsTaken - status.seats.included} extra @ ${formatEuros(
								status.seats.overagePerSeatCents
							)}/mo each)`
						: null}
				</Typography>

				<Typography variant='overline' color='text.secondary'>
					Members
				</Typography>
				<List dense disablePadding sx={{ mb: 2 }}>
					{memberships.map(m => {
						// Hide the remove button on the owner's own row (you can't remove yourself,
						// the API would 400) AND on any OWNER row (defensive — server rejects with
						// 409 even if a non-OWNER's owner row was somehow shown to us).
						const canRemove = isOwner && m.role !== 'OWNER' && m.user.id !== me.user.id;
						return (
							<ListItem
								key={m.id}
								disableGutters
								secondaryAction={
									canRemove ? (
										<IconButton
											edge='end'
											size='small'
											aria-label={`Remove ${m.user.email}`}
											disabled={removeMember.isPending}
											onClick={() => {
												if (window.confirm(`Remove ${m.user.email} from the organization?`)) {
													removeMember.mutate(m.user.id);
												}
											}}
										>
											×
										</IconButton>
									) : undefined
								}
							>
								<ListItemText
									primary={m.user.name ?? m.user.email}
									secondary={m.user.name ? m.user.email : null}
									sx={{ mr: canRemove ? 6 : 2 }}
								/>
								<Chip size='small' label={m.role} variant='outlined' sx={{ mr: canRemove ? 4 : 0 }} />
							</ListItem>
						);
					})}
				</List>

				{removeMember.error && (
					<Alert severity='error' sx={{ mb: 2 }}>
						{removeMember.error instanceof Error ? removeMember.error.message : 'Could not remove member.'}
					</Alert>
				)}

				{invitations.length > 0 && (
					<>
						<Typography variant='overline' color='text.secondary'>
							Pending invitations
						</Typography>
						<List dense disablePadding sx={{ mb: 2 }}>
							{invitations.map(inv => (
								<ListItem
									key={inv.id}
									disableGutters
									secondaryAction={
										isOwner && billingEntitled ? (
											<IconButton
												edge='end'
												size='small'
												aria-label='Revoke'
												disabled={revokeInvitation.isPending}
												onClick={() => revokeInvitation.mutate(inv.id)}
											>
												×
											</IconButton>
										) : undefined
									}
								>
									<ListItemText
										primary={inv.email}
										secondary={`expires ${toReadableDate(inv.expiresAt, 'D MMM YYYY')}`}
									/>
								</ListItem>
							))}
						</List>
					</>
				)}

				<Divider sx={{ my: 3 }} />

				{trialCapReached && isOwner && (
					<Alert
						severity='info'
						sx={{ mb: 2 }}
						action={
							<Button color='inherit' size='small' onClick={() => navigate({ to: '/billing' })}>
								Subscribe
							</Button>
						}
					>
						You've used all {status.seats.included} trial seats. Subscribe to invite more teammates and pay{' '}
						{formatEuros(status.seats.overagePerSeatCents)}/mo per extra seat.
					</Alert>
				)}

				{trialCapReached && !isOwner && (
					<Alert severity='info' sx={{ mb: 2 }}>
						This org has used all {status.seats.included} trial seats. Ask your owner to subscribe to add
						more teammates.
					</Alert>
				)}

				{isOwner && !billingEntitled && (
					<Alert
						severity='warning'
						sx={{ mb: 2 }}
						action={
							<Button color='inherit' size='small' onClick={() => navigate({ to: '/billing' })}>
								Subscribe
							</Button>
						}
					>
						{billingBlockedCopy(status.state)}
					</Alert>
				)}

				{isOwner && billingEntitled && (
					<>
						<Typography variant='overline' color='text.secondary' sx={{ display: 'block', mb: 1 }}>
							Invite a teammate
						</Typography>

						{isTrialSeatLimit && (
							<Alert severity='warning' sx={{ mb: 2 }}>
								{inviteError instanceof Error ? inviteError.message : 'Trial seat limit reached.'}
							</Alert>
						)}

						{inviteError && !isTrialSeatLimit && (
							<Alert severity='error' sx={{ mb: 2 }}>
								{inviteError instanceof Error ? inviteError.message : 'Could not send invitation.'}
							</Alert>
						)}

						{createInvitation.isSuccess && (
							<Alert severity='success' sx={{ mb: 2 }}>
								Invitation sent.
							</Alert>
						)}

						<Form<TeamInviteForm>
							action={values => {
								createInvitation.mutate({ email: values.email.trim(), role: values.role });
							}}
							schema={TeamInviteSchema}
							defaultValues={{ email: '', role: 'MEMBER' }}
							isDisabled={createInvitation.isPending || trialCapReached}
						>
							<InviteFormBody isSending={createInvitation.isPending} trialCapReached={trialCapReached} />
						</Form>
					</>
				)}

				{!isOwner && (
					<Typography variant='caption' color='text.secondary'>
						Only the organization owner can invite teammates.
					</Typography>
				)}
			</Paper>
		</Container>
	);
}

function InviteFormBody({ isSending, trialCapReached }: { isSending: boolean; trialCapReached: boolean }) {
	const role = useWatch<TeamInviteForm, 'role'>({ name: 'role' });
	const disabled = isSending || trialCapReached;
	return (
		<>
			<Stack direction={{ xs: 'column', sm: 'row' }} useFlexGap spacing={1}>
				<Field
					type='email'
					name='email'
					fullWidth
					required
					placeholder='teammate@example.com'
					disabled={disabled}
				/>
				<Select
					name='role'
					fullWidth
					disabled={disabled}
					options={ROLE_OPTIONS.map(option => ({ id: option.value, label: option.label }))}
				/>
				<Button type='submit' variant='contained' disabled={disabled} sx={{ minWidth: 'fit-content' }}>
					{isSending ? 'Sending...' : 'Send invite'}
				</Button>
			</Stack>
			<Typography variant='caption' color='text.secondary' sx={{ display: 'block', mt: 1 }}>
				{ROLE_OPTIONS.find(o => o.value === role)?.hint}
			</Typography>
		</>
	);
}

function billingBlockedCopy(state: BillingState): string {
	switch (state) {
		case 'none':
			return 'Start your 14-day free trial to invite teammates.';
		case 'canceled':
			return 'Your subscription has been canceled. Subscribe again to invite teammates.';
		case 'unpaid':
			return 'Your subscription is unpaid. Update your payment to invite teammates.';
		case 'paused':
			return 'Your subscription is paused. Resume it to invite teammates.';
		case 'incomplete':
			return 'Your subscription setup is incomplete. Complete checkout to invite teammates.';
		case 'incomplete_expired':
			return 'Your subscription setup expired. Subscribe again to invite teammates.';
		default:
			return 'Your subscription is inactive. Subscribe to invite teammates.';
	}
}

function formatEuros(cents: number): string {
	const whole = Math.floor(cents / 100);
	const remainder = cents % 100;
	return remainder === 0 ? `€${whole}` : `€${whole}.${remainder.toString().padStart(2, '0')}`;
}

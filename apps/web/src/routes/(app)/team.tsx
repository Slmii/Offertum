import { Banner } from '@/components/Banner.component';
import { Dialog } from '@/components/Dialog.component';
import { Field } from '@/components/Form/Field/Field.component';
import { Form } from '@/components/Form/Form.component';
import { Select } from '@/components/Form/Select/Select.component';
import { PageHeader } from '@/components/PageHeader.component';
import { SectionError } from '@/components/SectionError.component';
import { BodySmall, Overline } from '@/components/Text.component';
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
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import type { BillingState, MembershipRole } from '@offertum/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { useWatch } from 'react-hook-form';

// OWNER is omitted intentionally — every org has exactly one owner, set at org creation.
// Ownership transfer (if we ever build it) is a separate flow, not via invitation.
const ROLE_OPTIONS: ReadonlyArray<{ value: MembershipRole; label: string; hint: string }> = [
	{
		value: 'MEMBER',
		label: 'Member — can handle quote requests',
		hint: 'Standard teammate — can use the app day-to-day.'
	},
	{
		value: 'EXTERNAL',
		label: 'External — read-only access',
		hint: 'Limited access for contractors or clients.'
	}
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

	const [isInviteOpen, setIsInviteOpen] = useState(false);

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

	const pageHeaderCaption = useMemo(() => {
		let caption = `${seatsTaken} of ${status.seats.included} ${isTrial ? 'seats during trial' : 'included seats'}`;

		if (!isTrial && seatsTaken > status.seats.included) {
			caption += '(';

			caption += `${seatsTaken - status.seats.included} extra @ ${formatEuros(status.seats.overagePerSeatCents)}`;

			caption += '/mo each)';
		}

		return caption;
	}, [seatsTaken, status.seats.included, isTrial, status.seats.overagePerSeatCents]);

	return (
		<Stack>
			<Paper variant='outlined' sx={{ p: 5 }}>
				<PageHeader title='Team' caption={pageHeaderCaption} />

				<Overline color='textSecondary'>Members</Overline>
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
					<Banner tone='error' sx={{ mb: 2 }}>
						{removeMember.error instanceof Error ? removeMember.error.message : 'Could not remove member.'}
					</Banner>
				)}

				{invitations.length > 0 && (
					<>
						<Overline color='textSecondary'>Pending invitations</Overline>
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

						{revokeInvitation.error && (
							<Banner tone='error' sx={{ mb: 2 }}>
								{revokeInvitation.error instanceof Error
									? revokeInvitation.error.message
									: 'Could not revoke invitation.'}
							</Banner>
						)}
					</>
				)}

				<Divider sx={{ my: 3 }} />

				{trialCapReached && isOwner && (
					<Banner
						tone='info'
						sx={{ mb: 2 }}
						action={
							<Button color='inherit' size='small' onClick={() => navigate({ to: '/billing' })}>
								Subscribe
							</Button>
						}
					>
						You've used all {status.seats.included} trial seats. Subscribe to invite more teammates and pay{' '}
						{formatEuros(status.seats.overagePerSeatCents)}/mo per extra seat.
					</Banner>
				)}

				{trialCapReached && !isOwner && (
					<Banner tone='info' sx={{ mb: 2 }}>
						This org has used all {status.seats.included} trial seats. Ask your owner to subscribe to add
						more teammates.
					</Banner>
				)}

				{isOwner && !billingEntitled && (
					<Banner
						tone='warning'
						sx={{ mb: 2 }}
						action={
							<Button color='inherit' size='small' onClick={() => navigate({ to: '/billing' })}>
								Subscribe
							</Button>
						}
					>
						{billingBlockedCopy(status.state)}
					</Banner>
				)}

				{isOwner && billingEntitled && (
					<>
						{createInvitation.isSuccess && (
							<Banner tone='success' sx={{ mb: 2 }}>
								Invitation sent.
							</Banner>
						)}

						<Button
							variant='contained'
							onClick={() => setIsInviteOpen(true)}
							disabled={trialCapReached}
							fullWidth
						>
							Invite a teammate
						</Button>

						<InviteDialog
							isOpen={isInviteOpen}
							isSending={createInvitation.isPending}
							error={inviteError}
							isTrialSeatLimit={isTrialSeatLimit}
							onClose={() => setIsInviteOpen(false)}
							onSubscribe={() => {
								setIsInviteOpen(false);
								navigate({ to: '/billing' });
							}}
							onSubmit={values => {
								createInvitation.mutate(
									{ email: values.email.trim(), role: values.role },
									{ onSuccess: () => setIsInviteOpen(false) }
								);
							}}
						/>
					</>
				)}

				{!isOwner && (
					<BodySmall color='textSecondary'>Only the organization owner can invite teammates.</BodySmall>
				)}
			</Paper>
		</Stack>
	);
}

const INVITE_FORM_ID = 'team-invite-form';

function InviteDialog({
	isOpen,
	isSending,
	error,
	isTrialSeatLimit,
	onClose,
	onSubscribe,
	onSubmit
}: {
	isOpen: boolean;
	isSending: boolean;
	isTrialSeatLimit: boolean;
	error: Error | null;
	onClose: () => void;
	onSubscribe: () => void;
	onSubmit: (values: TeamInviteForm) => void;
}) {
	return (
		<Dialog
			open={isOpen}
			title='Invite a teammate'
			onClose={onClose}
			disableClose={isSending}
			width={440}
			action={
				<>
					<Button onClick={onClose} disabled={isSending}>
						Cancel
					</Button>
					<Button
						type='submit'
						form={INVITE_FORM_ID}
						variant='contained'
						disabled={isSending}
						startIcon={isSending ? <CircularProgress size={14} /> : null}
					>
						{isSending ? 'Sending...' : 'Send invite'}
					</Button>
				</>
			}
		>
			{isTrialSeatLimit && (
				<Banner
					tone='warning'
					sx={{ mb: 2 }}
					action={
						<Button color='inherit' size='small' onClick={onSubscribe}>
							Subscribe
						</Button>
					}
				>
					{error instanceof Error ? error.message : 'Trial seat limit reached.'}
				</Banner>
			)}

			{error && !isTrialSeatLimit && (
				<Banner tone='error' sx={{ mb: 2 }}>
					{error instanceof Error ? error.message : 'Could not send invitation.'}
				</Banner>
			)}

			<Form<TeamInviteForm>
				id={INVITE_FORM_ID}
				action={onSubmit}
				schema={TeamInviteSchema}
				defaultValues={{ email: '', role: 'MEMBER' }}
				isDisabled={isSending}
			>
				<InviteFormBody />
			</Form>
		</Dialog>
	);
}

function InviteFormBody() {
	const role = useWatch<TeamInviteForm, 'role'>({ name: 'role' });
	return (
		<Stack spacing={1.5}>
			<Field
				type='email'
				name='email'
				label='Email address'
				fullWidth
				required
				placeholder='teammate@example.com'
			/>
			<Select
				name='role'
				label='Role'
				fullWidth
				options={ROLE_OPTIONS.map(option => ({ id: option.value, label: option.label }))}
			/>
			<BodySmall color='textSecondary'>{ROLE_OPTIONS.find(o => o.value === role)?.hint}</BodySmall>
		</Stack>
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

import { AppIcon } from '@/components/AppIcon.component';
import { Avatar } from '@/components/Avatar.component';
import { BodySmall } from '@/components/Text.component';
import { useToast } from '@/lib/hooks/use-toast';
import { useAssignOpportunity } from '@/lib/queries/opportunities.queries';
import { membershipsQueryOptions, myMembershipQueryOptions } from '@/lib/queries/team.queries';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Divider from '@mui/material/Divider';
import InputLabel from '@mui/material/InputLabel';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import { useTheme } from '@mui/material/styles';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useState } from 'react';

/**
 * Custom "Toegewezen aan" picker — ported from the design's `AssigneePicker`. The trigger shows
 * the assignee's avatar + name (or a dashed "Niet toegewezen"); the menu lists team members
 * (with a "· jij" tag for the current user and a "Mailbox-eigenaar" sub-line for whoever's inbox
 * the request landed in) plus a "Niemand" option. A "Binnengekomen op mailbox van …" hint sits
 * below when the mailbox owner isn't the current assignee. Selection is optimistic (re-syncs from
 * the prop, reverts + toasts on error).
 */
export function AssigneePicker({
	opportunityId,
	assignedToUserId,
	mailboxOwnerUserId,
	mailboxOwnerName
}: {
	opportunityId: string;
	assignedToUserId: string | null;
	mailboxOwnerUserId?: string | null;
	mailboxOwnerName?: string | null;
}) {
	const { tokens } = useTheme();
	const c = tokens.color;
	const { data: memberships } = useSuspenseQuery(membershipsQueryOptions);
	const { data: me } = useSuspenseQuery(myMembershipQueryOptions);
	const assign = useAssignOpportunity(opportunityId);
	const toast = useToast();
	const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

	// Optimistic mirror so the trigger reflects the pick immediately (no flash of the previous
	// assignee during the round-trip); re-syncs from the prop, reverts on error.
	const [selectedUserId, setSelectedUserId] = useState<string | null>(assignedToUserId);
	const [prevAssigned, setPrevAssigned] = useState<string | null>(assignedToUserId);
	if (assignedToUserId !== prevAssigned) {
		setPrevAssigned(assignedToUserId);
		setSelectedUserId(assignedToUserId);
	}

	const members = memberships.filter(membership => membership.role !== 'EXTERNAL');
	const selected = members.find(membership => membership.user.id === selectedUserId)?.user ?? null;
	const isOpen = Boolean(anchorEl);

	const commit = (userId: string | null) => {
		setAnchorEl(null);
		if (userId === selectedUserId) {
			return;
		}
		setSelectedUserId(userId);
		assign.mutate(
			{ userId },
			{
				onError: err => {
					setSelectedUserId(assignedToUserId);
					toast.error('Toewijzen mislukt', err instanceof Error ? err.message : 'Probeer het opnieuw.');
				}
			}
		);
	};

	const nameOf = (user: { id: string; name: string | null; email: string }) => user.name?.trim() || user.email;
	const dashedAvatarSx = (size: number) => ({
		width: size,
		height: size,
		borderRadius: `${tokens.radius.sm}px`,
		backgroundColor: c.paper2,
		border: `1px dashed ${c.lineStrong}`,
		color: c.ink4,
		display: 'inline-flex',
		alignItems: 'center',
		justifyContent: 'center',
		flexShrink: 0
	});

	return (
		<Paper variant='outlined' sx={{ p: 2.25 }}>
			<InputLabel sx={{ mb: 0.75 }}>Toegewezen aan</InputLabel>
			<ButtonBase
				disabled={assign.isPending}
				onClick={event => setAnchorEl(event.currentTarget)}
				sx={{
					display: 'flex',
					alignItems: 'center',
					gap: 1,
					width: '100%',
					minHeight: 36,
					padding: '0 10px 0 8px',
					backgroundColor: c.surface,
					border: `1px solid ${isOpen ? c.accent[500] : c.lineStrong}`,
					borderRadius: `${tokens.radius.md}px`,
					boxShadow: isOpen ? tokens.focusRing : 'none',
					fontFamily: tokens.font.sans,
					fontSize: 14,
					textAlign: 'left',
					cursor: assign.isPending ? 'default' : 'pointer'
				}}
			>
				{selected ? (
					<>
						<Avatar name={nameOf(selected)} size={22} />
						<Box
							component='span'
							sx={{
								flex: 1,
								minWidth: 0,
								color: c.ink1,
								fontWeight: 'medium',
								overflow: 'hidden',
								textOverflow: 'ellipsis',
								whiteSpace: 'nowrap'
							}}
						>
							{nameOf(selected)}
							{selected.id === me.user.id && (
								<Box component='span' sx={{ color: c.ink4, fontWeight: 'normal' }}>
									{' · jij'}
								</Box>
							)}
						</Box>
					</>
				) : (
					<>
						<Box component='span' sx={dashedAvatarSx(22)}>
							<AppIcon name='user-plus' size='small' />
						</Box>
						<Box component='span' sx={{ flex: 1, minWidth: 0, color: c.ink4 }}>
							Niet toegewezen
						</Box>
					</>
				)}
				<Box component='span' sx={{ display: 'inline-flex', color: c.ink3, flexShrink: 0 }}>
					<AppIcon name='chevron-down' size='small' />
				</Box>
			</ButtonBase>

			{mailboxOwnerName && mailboxOwnerUserId !== selectedUserId && (
				<BodySmall
					color='text.disabled'
					sx={{ mt: 0.75, display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
				>
					<AppIcon name='mail' size='small' /> Binnengekomen op mailbox van
					<Box component='span' sx={{ color: c.ink3, fontWeight: 'medium' }}>
						{mailboxOwnerName}
					</Box>
				</BodySmall>
			)}

			<Menu
				anchorEl={anchorEl}
				open={isOpen}
				onClose={() => setAnchorEl(null)}
				slotProps={{ paper: { sx: { minWidth: anchorEl?.offsetWidth ?? 280 } } }}
			>
				<Box
					sx={{
						px: 1.25,
						pt: 0.75,
						pb: 0.5,
						fontSize: 10,
						fontWeight: 'bold',
						letterSpacing: '0.06em',
						textTransform: 'uppercase',
						color: c.ink4
					}}
				>
					Teamleden
				</Box>
				{members.map(membership => {
					const { user } = membership;
					const isSelected = user.id === selectedUserId;
					const isOwner = user.id === mailboxOwnerUserId;
					return (
						<MenuItem
							key={user.id}
							selected={isSelected}
							onClick={() => commit(user.id)}
							sx={{ gap: 1.25 }}
						>
							<Avatar name={nameOf(user)} size={24} />
							<Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
								<Box
									component='span'
									sx={{
										fontWeight: isSelected ? 'bold' : 'medium',
										color: isSelected ? c.accent[700] : c.ink1,
										overflow: 'hidden',
										textOverflow: 'ellipsis',
										whiteSpace: 'nowrap'
									}}
								>
									{nameOf(user)}
									{user.id === me.user.id && (
										<Box component='span' sx={{ color: c.ink4, fontWeight: 'normal' }}>
											{' · jij'}
										</Box>
									)}
								</Box>
								{isOwner && (
									<Box
										component='span'
										sx={{
											fontSize: 11,
											color: c.ink4,
											display: 'inline-flex',
											alignItems: 'center',
											gap: 0.5
										}}
									>
										<AppIcon name='mail' size='small' /> Mailbox-eigenaar
									</Box>
								)}
							</Box>
							{isSelected && (
								<Box
									component='span'
									sx={{ display: 'inline-flex', color: c.accent[500], flexShrink: 0 }}
								>
									<AppIcon name='check' size='small' />
								</Box>
							)}
						</MenuItem>
					);
				})}
				<Divider />
				<MenuItem selected={selectedUserId === null} onClick={() => commit(null)} sx={{ gap: 1.25 }}>
					<Box component='span' sx={dashedAvatarSx(24)}>
						<AppIcon name='user-x' size='small' />
					</Box>
					<Box component='span' sx={{ flex: 1, color: c.ink3 }}>
						Niemand
					</Box>
					{selectedUserId === null && (
						<Box component='span' sx={{ display: 'inline-flex', color: c.accent[500], flexShrink: 0 }}>
							<AppIcon name='check' size='small' />
						</Box>
					)}
				</MenuItem>
			</Menu>
		</Paper>
	);
}

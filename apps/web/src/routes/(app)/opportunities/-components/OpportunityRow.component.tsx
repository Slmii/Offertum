import { AppIcon, type AppIconName } from '@/components/AppIcon.component';
import { Pill } from '@/components/Pill.component';
import { PillSelect } from '@/components/PillSelect.component';
import { Body, BodySmall } from '@/components/Text.component';
import { useUndismissOpportunity, useUpdateOpportunityStatus } from '@/lib/queries/opportunities.queries';
import { toReadableDate, toReadableTimestamp } from '@/lib/utils/date.utils';
import {
	getStatusOptionsForCurrent,
	OPPORTUNITY_DISMISS_REASON_LABELS_NL,
	OPPORTUNITY_STATUS_LABELS_NL,
	OPPORTUNITY_STATUS_PILL_TONES,
	OPPORTUNITY_URGENCY_COLORS,
	opportunityCustomerLabel
} from '@/lib/utils/opportunity.utils';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useTheme } from '@mui/material/styles';
import type { Opportunity } from '@offertum/shared';
import { useNavigate } from '@tanstack/react-router';
import { Fragment, useState } from 'react';
import { DismissDialog } from './DismissDialog.component';
import { LastActivityBadge } from './LastActivityBadge.component';

// Fixed width of the right meta column (arrival time ⇆ hover affordance) — the same on every
// row so the timestamps + kebab line up under each other. Sized for the longest affordance
// ("Beoordeel follow-up →") so the absolutely-positioned hover label never overflows.
const META_COLUMN_WIDTH = 172;

/**
 * A single opportunity row in the list. Whole card navigates to the detail; interactive bits
 * (status pill, kebab) stop propagation. Hover reveals a left accent bar + an "Open / Bekijk
 * concept / Beoordeel follow-up" affordance (which replaces the arrival timestamp). Pending
 * check-ins and dismissed rows get distinct tinting + badges.
 */
export function OpportunityRow({ opportunity }: { opportunity: Opportunity }) {
	const { tokens } = useTheme();
	const navigate = useNavigate();
	const status = opportunity.status;
	const isDismissed = opportunity.dismissedAt !== null;
	const pendingCheckIn = opportunity.hasPendingCheckIn && !isDismissed;
	const isNew = (status === 'new' || pendingCheckIn) && !isDismissed;
	const affordance = isNew ? (pendingCheckIn ? 'Beoordeel follow-up' : 'Bekijk concept') : 'Open';
	const deadlineLabel = opportunity.customerDeadline ? toReadableDate(opportunity.customerDeadline) : null;
	const appointmentLabel = opportunity.customerAppointment ? toReadableDate(opportunity.customerAppointment) : null;
	const arrivedLabel = toReadableTimestamp(opportunity.internalDate);
	const customerLabel = opportunityCustomerLabel(opportunity);
	// Sub-line meta chips: address (truncates), deadline, appointment. Built as a list so a
	// row can carry any combination (the `hasAppointment` list filter implies an appointment cue).
	const metaParts: { icon: AppIconName; text: string; truncate?: boolean }[] = [];
	if (opportunity.address) {
		metaParts.push({ icon: 'map-pin', text: opportunity.address, truncate: true });
	}
	if (deadlineLabel) {
		metaParts.push({ icon: 'calendar', text: deadlineLabel });
	}
	if (appointmentLabel) {
		metaParts.push({ icon: 'clock', text: appointmentLabel });
	}
	const updateStatus = useUpdateOpportunityStatus();
	const undismiss = useUndismissOpportunity();
	const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
	const [dismissOpen, setDismissOpen] = useState(false);
	const c = tokens.color;
	const dur = `${tokens.motion.durBase}ms`;

	const openMenu = (e: React.MouseEvent<HTMLElement>) => {
		e.stopPropagation();
		setMenuAnchor(e.currentTarget);
	};
	const closeMenu = () => setMenuAnchor(null);
	const goToDetail = () => navigate({ to: '/opportunities/$id', params: { id: opportunity.id } });

	return (
		<>
			<Box
				role='button'
				tabIndex={0}
				aria-label={`Open ${customerLabel}`}
				onClick={goToDetail}
				onKeyDown={e => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						goToDetail();
					}
				}}
				sx={{
					position: 'relative',
					overflow: 'hidden',
					display: 'flex',
					alignItems: 'center',
					gap: 2,
					p: '14px 18px 14px 20px',
					borderRadius: `${tokens.radius.md}px`,
					backgroundColor: isDismissed ? c.paper2 : pendingCheckIn ? c.accent[50] : c.surface,
					border: `1px solid ${isDismissed ? c.line : pendingCheckIn ? c.accent[300] : c.line}`,
					opacity: isDismissed ? 0.6 : 1,
					cursor: 'pointer',
					transition: `background ${dur}, border-color ${dur}, transform ${dur}`,
					...(!isDismissed && {
						'&:hover': {
							backgroundColor: pendingCheckIn ? c.accent[100] : c.paper2,
							borderColor: pendingCheckIn ? c.accent[500] : c.lineStrong,
							transform: 'translateX(2px)'
						},
						'&:hover .opp-accent': { opacity: 1, transform: 'translateX(0)' },
						'&:hover .opp-arrived': { opacity: 0 },
						'&:hover .opp-affordance': { opacity: 1, transform: 'translateY(-50%) translateX(0)' },
						'&:hover .opp-kebab': { opacity: 1 }
					})
				}}
			>
				{!isDismissed && (
					<Box
						className='opp-accent'
						aria-hidden='true'
						sx={{
							position: 'absolute',
							left: 0,
							top: 0,
							bottom: 0,
							width: pendingCheckIn ? 4 : 3,
							backgroundColor: isNew ? c.accent[500] : c.accent[300],
							opacity: isNew ? 1 : 0,
							transform: isNew ? 'translateX(0)' : 'translateX(-4px)',
							transition: `opacity ${dur}, transform ${dur}`
						}}
					/>
				)}

				<Box
					aria-label={`Urgentie: ${opportunity.urgency}`}
					sx={{
						width: 10,
						height: 10,
						borderRadius: '50%',
						backgroundColor: OPPORTUNITY_URGENCY_COLORS[opportunity.urgency],
						flexShrink: 0
					}}
				/>

				{/* Fixed-width status column so every customer name lines up under each other,
				    regardless of the status label's length. Dismissed rows (a separate view) show a
				    wider "Afgewezen · reason" pill and size naturally so it can't overlap the name. */}
				<Box sx={{ flexShrink: 0, width: isDismissed ? 'auto' : 140 }} onClick={e => e.stopPropagation()}>
					{isDismissed && opportunity.dismissReason ? (
						<Pill tone='lost'>
							Afgewezen · {OPPORTUNITY_DISMISS_REASON_LABELS_NL[opportunity.dismissReason]}
						</Pill>
					) : (
						<PillSelect
							value={status}
							ariaLabel='Status wijzigen'
							disabled={updateStatus.isPending || isDismissed}
							onChange={next => updateStatus.mutate({ id: opportunity.id, status: next })}
							options={getStatusOptionsForCurrent(status).map(s => ({
								id: s,
								label: OPPORTUNITY_STATUS_LABELS_NL[s],
								tone: OPPORTUNITY_STATUS_PILL_TONES[s]
							}))}
						/>
					)}
				</Box>

				<Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
					<Box
						sx={{
							display: 'flex',
							alignItems: 'baseline',
							gap: 1,
							whiteSpace: 'nowrap',
							overflow: 'hidden'
						}}
					>
						<Body fontWeight='medium' sx={{ flexShrink: 0 }}>
							{customerLabel}
						</Body>
						<Box component='span' sx={{ color: c.ink4 }}>
							·
						</Box>
						<BodySmall color='text.secondary' sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
							{opportunity.requestType}
						</BodySmall>
					</Box>
					{metaParts.length > 0 && (
						<Box
							sx={{
								display: 'flex',
								alignItems: 'center',
								gap: 1.25,
								color: c.ink3,
								fontSize: 12,
								whiteSpace: 'nowrap',
								overflow: 'hidden'
							}}
						>
							{metaParts.map((part, i) => (
								<Fragment key={part.icon}>
									{i > 0 && (
										<Box component='span' sx={{ color: c.lineStrong }}>
											·
										</Box>
									)}
									<Box
										component='span'
										sx={{
											display: 'inline-flex',
											alignItems: 'center',
											gap: 0.5,
											...(part.truncate ? { minWidth: 0 } : { flexShrink: 0 })
										}}
									>
										<AppIcon name={part.icon} size='small' />
										<Box
											component='span'
											sx={part.truncate ? { overflow: 'hidden', textOverflow: 'ellipsis' } : undefined}
										>
											{part.text}
										</Box>
									</Box>
								</Fragment>
							))}
						</Box>
					)}
					{opportunity.subject && (
						<Box
							component='span'
							sx={{
								fontSize: 12,
								color: c.ink4,
								fontStyle: 'italic',
								overflow: 'hidden',
								textOverflow: 'ellipsis',
								whiteSpace: 'nowrap'
							}}
						>
							{opportunity.subject}
						</Box>
					)}
				</Box>

				<LastActivityBadge lastActivity={opportunity.lastActivity} />

				{!isDismissed && opportunity.assignedToName && (
					<Box
						component='span'
						title={`Toegewezen aan ${opportunity.assignedToName}`}
						sx={{
							display: 'inline-flex',
							alignItems: 'center',
							gap: 0.5,
							flexShrink: 0,
							maxWidth: 150,
							px: '7px',
							py: '2px',
							backgroundColor: c.paper2,
							border: `1px solid ${c.line}`,
							color: c.ink3,
							fontSize: 11,
							fontWeight: 'medium',
							borderRadius: `${tokens.radius.sm}px`,
							whiteSpace: 'nowrap'
						}}
					>
						<AppIcon name='user' size='small' />
						<Box component='span' sx={{ color: c.ink2, overflow: 'hidden', textOverflow: 'ellipsis' }}>
							{opportunity.assignedToName}
						</Box>
					</Box>
				)}

				{opportunity.customerReplyCount > 0 && (
					<Box
						component='span'
						sx={{
							display: 'inline-flex',
							alignItems: 'center',
							gap: 0.5,
							flexShrink: 0,
							px: '8px',
							py: '3px',
							backgroundColor: c.paper2,
							border: `1px solid ${c.line}`,
							color: c.ink2,
							fontSize: 12,
							fontWeight: 'medium',
							borderRadius: `${tokens.radius.sm}px`,
							whiteSpace: 'nowrap'
						}}
					>
						<AppIcon name='corner-up-left' size='small' />
						{opportunity.customerReplyCount}{' '}
						{opportunity.customerReplyCount === 1 ? 'antwoord' : 'antwoorden'}
					</Box>
				)}

				{pendingCheckIn && (
					<Box
						component='span'
						onClick={e => e.stopPropagation()}
						title='Een automatische follow-up wacht op je beoordeling'
						sx={{
							display: 'inline-flex',
							alignItems: 'center',
							gap: 0.75,
							flexShrink: 0,
							px: '8px',
							py: '4px',
							backgroundColor: c.accent[500],
							color: c.surface,
							fontSize: 12,
							fontWeight: 'bold',
							borderRadius: `${tokens.radius.sm}px`,
							whiteSpace: 'nowrap'
						}}
					>
						<AppIcon name='sparkles' size='small' /> Follow-up wacht
					</Box>
				)}

				<Box
					sx={{
						flexShrink: 0,
						position: 'relative',
						width: META_COLUMN_WIDTH,
						textAlign: 'right',
						fontSize: 12,
						color: c.ink4
					}}
				>
					<Box
						component='span'
						className='opp-arrived'
						sx={{ display: 'inline-block', transition: `opacity ${dur}` }}
					>
						{arrivedLabel}
					</Box>
					<Box
						component='span'
						className='opp-affordance'
						aria-hidden='true'
						sx={{
							position: 'absolute',
							right: 0,
							top: '50%',
							transform: 'translateY(-50%) translateX(8px)',
							opacity: 0,
							pointerEvents: 'none',
							display: 'inline-flex',
							alignItems: 'center',
							gap: 0.5,
							color: c.accent[700],
							fontWeight: 'bold',
							whiteSpace: 'nowrap',
							transition: `opacity ${dur}, transform ${dur}`
						}}
					>
						{affordance} <AppIcon name='arrow-right' size='small' />
					</Box>
				</Box>

				<Box sx={{ flexShrink: 0 }} onClick={e => e.stopPropagation()}>
					<IconButton
						className='opp-kebab'
						size='small'
						onClick={openMenu}
						aria-label='Acties'
						sx={{ opacity: 0.6, transition: `opacity ${dur}` }}
					>
						<AppIcon name='dots-vertical' size='medium' />
					</IconButton>
					<Menu anchorEl={menuAnchor} open={menuAnchor !== null} onClose={closeMenu}>
						{isDismissed ? (
							<MenuItem
								onClick={() => {
									closeMenu();
									undismiss.mutate({ id: opportunity.id });
								}}
								disabled={undismiss.isPending}
							>
								Niet afgewezen
							</MenuItem>
						) : (
							<MenuItem
								onClick={() => {
									closeMenu();
									setDismissOpen(true);
								}}
							>
								Geen offerteaanvraag
							</MenuItem>
						)}
					</Menu>
				</Box>
			</Box>

			{dismissOpen && (
				<DismissDialog
					opportunityId={opportunity.id}
					replyDraftSentAt={opportunity.replyDraftSentAt}
					onClose={() => setDismissOpen(false)}
				/>
			)}
		</>
	);
}

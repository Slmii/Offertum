import { AppIcon } from '@/components/AppIcon.component';
import { FlowingGradient } from '@/components/FlowingGradient.component';
import { Body, BodySmall } from '@/components/Text.component';
import { opportunitiesListQueryOptions } from '@/lib/queries/opportunities.queries';
import { opportunityCustomerLabel } from '@/lib/utils/opportunity.utils';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import { useTheme } from '@mui/material/styles';
import type { Opportunity } from '@offertum/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';

// Query for the opps with an auto follow-up (check-in) draft awaiting review — independent of
// the page's current filters. Prefetch this in the route loader so the banner doesn't waterfall.
export const pendingFollowUpsQueryOptions = () =>
	opportunitiesListQueryOptions(null, null, 'active', null, null, { pendingFollowup: true });

// At most this many rows render inline; the rest collapse into a "Toon alle …" button so the
// fixed page header stays compact.
const MAX_VISIBLE = 2;

/**
 * Review banner for pending auto follow-ups — Offertum-drafted check-ins for opportunities that
 * have gone silent. Sits below the page header on the opportunities list and renders nothing
 * when there are none. Each row deep-links to the opportunity's draft for one-click review.
 */
export function PendingFollowUpsBanner() {
	const { tokens } = useTheme();
	const navigate = useNavigate();
	const { data } = useSuspenseQuery(pendingFollowUpsQueryOptions());

	const opps = data.opportunities;
	if (opps.length === 0) {
		return null;
	}

	const c = tokens.color;
	const visible = opps.slice(0, MAX_VISIBLE);
	const overflow = opps.length - visible.length;
	const title =
		opps.length === 1
			? '1 follow-up wacht op je beoordeling'
			: `${opps.length} follow-ups wachten op je beoordeling`;

	return (
		<Paper variant='outlined' sx={{ p: 0, overflow: 'hidden', mb: 3, borderColor: c.accent[300] }}>
			{/* Header band — flowing accent gradient (ported from the design's `.qm-followup-flow`),
			    white text on top, to catch the eye. */}
			<FlowingGradient sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: '12px 16px' }}>
				<Box
					sx={{
						width: 30,
						height: 30,
						borderRadius: `${tokens.radius.sm}px`,
						backgroundColor: 'rgba(255, 255, 255, 0.16)',
						border: '1px solid rgba(255, 255, 255, 0.30)',
						color: '#fff',
						display: 'inline-flex',
						alignItems: 'center',
						justifyContent: 'center',
						flexShrink: 0
					}}
				>
					<AppIcon name='sparkles' size='small' />
				</Box>
				<Box sx={{ minWidth: 0 }}>
					<Body fontWeight='bold' sx={{ color: '#fff' }}>
						{title}
					</Body>
					<BodySmall sx={{ color: 'rgba(255, 255, 255, 0.82)' }}>
						Offertum heeft concepten klaarstaan voor klanten die stil zijn geworden.
					</BodySmall>
				</Box>
			</FlowingGradient>

			{visible.map(op => (
				<PendingRow
					key={op.id}
					opportunity={op}
					onOpen={() => navigate({ to: '/opportunities/$id', params: { id: op.id } })}
				/>
			))}

			{overflow > 0 && (
				<Box
					component='button'
					type='button'
					onClick={() => navigate({ to: '/opportunities', search: { pendingFollowup: true } })}
					sx={{
						width: '100%',
						display: 'inline-flex',
						alignItems: 'center',
						justifyContent: 'flex-start',
						gap: 0.5,
						border: 'none',
						borderTop: `1px solid ${c.line}`,
						background: 'transparent',
						p: '12px 20px',
						color: c.accent[700],
						fontFamily: tokens.font.sans,
						fontSize: 13,
						fontWeight: 'bold',
						cursor: 'pointer',
						transition: `background ${tokens.motion.durFast}ms`,
						'&:hover': { backgroundColor: c.paper2 }
					}}
				>
					Toon alle {opps.length} follow-ups <AppIcon name='arrow-right' size='small' />
				</Box>
			)}
		</Paper>
	);
}

function PendingRow({ opportunity, onOpen }: { opportunity: Opportunity; onOpen: () => void }) {
	const { tokens } = useTheme();
	const c = tokens.color;
	const silentDays = daysSince(opportunity.replyDraftSentAt);

	return (
		<Box
			role='button'
			tabIndex={0}
			onClick={onOpen}
			onKeyDown={e => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					onOpen();
				}
			}}
			sx={{
				display: 'flex',
				alignItems: 'center',
				gap: 2,
				p: '12px 20px',
				borderTop: `1px solid ${c.line}`,
				cursor: 'pointer',
				transition: `background ${tokens.motion.durFast}ms`,
				'&:hover': { backgroundColor: c.paper2 }
			}}
		>
			<Box sx={{ flex: 1, minWidth: 0 }}>
				<Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, whiteSpace: 'nowrap', overflow: 'hidden' }}>
					<Body fontWeight='medium' sx={{ flexShrink: 0 }}>
						{opportunityCustomerLabel(opportunity)}
					</Body>
					<Box component='span' sx={{ color: c.ink4 }}>
						·
					</Box>
					<BodySmall color='text.secondary' sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
						{opportunity.requestType}
					</BodySmall>
				</Box>
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, color: c.ink3, fontSize: 12, mt: '2px' }}>
					<Box component='span' sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
						<AppIcon name='file-text' size='small' />
						Concept gereed
					</Box>
					{silentDays !== null && (
						<>
							<Box component='span' sx={{ color: c.lineStrong }}>
								·
							</Box>
							<Box component='span' sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
								<AppIcon name='clock' size='small' />
								Stil sinds {silentDays} {silentDays === 1 ? 'dag' : 'dagen'}
							</Box>
						</>
					)}
				</Box>
			</Box>
			<Box
				component='span'
				sx={{
					flexShrink: 0,
					display: 'inline-flex',
					alignItems: 'center',
					gap: 0.5,
					color: c.accent[700],
					fontSize: 13,
					fontWeight: 'bold'
				}}
			>
				Beoordeel <AppIcon name='arrow-right' size='small' />
			</Box>
		</Box>
	);
}

// Whole days since `iso` (the last sent reply), or null when there's no timestamp.
function daysSince(iso: string | null): number | null {
	if (!iso) {
		return null;
	}
	const ms = Date.now() - new Date(iso).getTime();
	return Math.max(0, Math.floor(ms / 86_400_000));
}

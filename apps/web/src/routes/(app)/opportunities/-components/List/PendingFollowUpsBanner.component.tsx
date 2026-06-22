import { AppIcon } from '@/components/AppIcon.component';
import { FlowingGradient } from '@/components/FlowingGradient.component';
import { Body, BodySmall } from '@/components/Text.component';
import { opportunitiesListQueryOptions } from '@/lib/queries/opportunities.queries';
import { opportunityCustomerLabel } from '@/lib/utils/opportunity.utils';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import { useTheme } from '@mui/material/styles';
import type { Opportunity } from '@offertum/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

// Query for the opps with an auto follow-up (check-in) draft awaiting review — independent of
// the page's current filters. Prefetch this in the route loader so the banner doesn't waterfall.
export const pendingFollowUpsQueryOptions = () =>
	opportunitiesListQueryOptions(null, null, 'active', null, null, { pendingFollowup: true });

// At most this many rows render inline; the rest collapse into a "Toon alle …" button so the
// fixed page header stays compact.
const MAX_VISIBLE = 2;

// Persisted set of dismissed check-in "signatures". A signature is per-check-in (opp id + the
// check-in draft timestamp), so dismissing hides the CURRENT batch but a new or regenerated
// follow-up produces a fresh signature → the banner returns.
const DISMISS_STORAGE_KEY = 'offertum.pendingFollowups.dismissed';

// Identifies one pending check-in; `lastActivity.at` is the check-in draft's createdAt for a
// pending-check-in opp, so it changes when a new follow-up is drafted.
const checkInSignature = (op: Opportunity) => `${op.id}:${op.lastActivity?.at ?? ''}`;

function readDismissed(): Set<string> {
	try {
		const raw = localStorage.getItem(DISMISS_STORAGE_KEY);
		return new Set(raw ? (JSON.parse(raw) as string[]) : []);
	} catch {
		return new Set();
	}
}

function writeDismissed(signatures: string[]): void {
	try {
		localStorage.setItem(DISMISS_STORAGE_KEY, JSON.stringify(signatures));
	} catch {
		// localStorage unavailable (private mode / SSR) — dismissal just won't persist.
	}
}

/**
 * Review banner for pending auto follow-ups — Offertum-drafted check-ins for opportunities that
 * have gone silent. Sits below the page header on the opportunities list and renders nothing
 * when there are none. Each row deep-links to the opportunity's draft for one-click review.
 */
export function PendingFollowUpsBanner() {
	const { tokens } = useTheme();
	const navigate = useNavigate();
	const { data } = useSuspenseQuery(pendingFollowUpsQueryOptions());

	// Read the persisted dismissals after mount (kept out of the initializer so SSR + the first
	// client render agree — same pattern as the app shell). `hydrated` gates the render until that
	// read lands: without it the banner paints once with an empty dismissed set, then disappears a
	// tick later when the effect runs — a visible flash on every refresh for already-dismissed batches.
	const [hydrated, setHydrated] = useState(false);
	const [dismissed, setDismissed] = useState<Set<string>>(new Set());
	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect
		setDismissed(readDismissed());
		setHydrated(true);
	}, []);

	const opps = data.opportunities;
	const signatures = opps.map(checkInSignature);
	// Show while there's at least one pending check-in the user hasn't dismissed yet.
	const hasUndismissed = signatures.some(sig => !dismissed.has(sig));

	const onDismiss = () => {
		// Snapshot exactly the current batch — drops stale signatures and keeps the set bounded.
		setDismissed(new Set(signatures));
		writeDismissed(signatures);
	};

	if (!hydrated || opps.length === 0 || !hasUndismissed) {
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
				<Box sx={{ minWidth: 0, flex: 1 }}>
					<Body fontWeight='bold' sx={{ color: '#fff' }}>
						{title}
					</Body>
					<BodySmall sx={{ color: 'rgba(255, 255, 255, 0.82)' }}>
						Offertum heeft concepten klaarstaan voor klanten die stil zijn geworden.
					</BodySmall>
				</Box>
				<IconButton
					aria-label='Verberg tot een nieuwe follow-up'
					onClick={onDismiss}
					size='small'
					sx={{
						color: '#fff',
						flexShrink: 0,
						alignSelf: 'flex-start',
						mr: -0.5,
						'&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.16)' }
					}}
				>
					<AppIcon name='x' size='small' />
				</IconButton>
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
					<BodySmall color='textSecondary' sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
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

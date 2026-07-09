import { AppIcon } from '@/components/AppIcon.component';
import { Body, BodySmall } from '@/components/Text.component';
import { opportunitiesListQueryOptions } from '@/lib/queries/opportunities.queries';
import { toDaysSinceLabel } from '@/lib/utils/date.utils';
import { opportunityCustomerLabel } from '@/lib/utils/opportunity.utils';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
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
	opportunitiesListQueryOptions(null, null, 'active', null, [], { pendingFollowup: true });

// At most this many rows render inline; the rest collapse into a "Toon alle …" button so the
// fixed page header stays compact.
const MAX_VISIBLE = 2;

// Persisted set of dismissed check-in "signatures". A signature is per-check-in (opp id + the
// check-in draft timestamp), so dismissing hides the CURRENT batch but a new or regenerated
// follow-up produces a fresh signature → the banner returns.
const DISMISS_STORAGE_KEY = 'offertum.pendingFollowups.dismissed';

// Stable identifier for one pending check-in batch. Uses checkInDraftCreatedAt (the draft's own
// timestamp) rather than lastActivity.at, which changes on any field edit and would otherwise
// re-show a dismissed banner with no new check-in present.
const checkInSignature = (op: Opportunity) => `${op.id}:${op.checkInDraftCreatedAt ?? ''}`;

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
 * Query + client-side per-batch dismissal for pending check-ins. The single owner of the
 * dismissal state, so the insights summary count and the expanded banner never diverge:
 * `OppInsights` calls this once and passes `undismissed` + `dismiss` down to the banner.
 *
 * `hydrated` gates rendering until the localStorage read lands (kept out of the initializer so
 * SSR + the first client render agree) — without it an already-dismissed batch flashes on refresh.
 */
export function usePendingFollowUps() {
	const { data } = useSuspenseQuery(pendingFollowUpsQueryOptions());

	const [hydrated, setHydrated] = useState(false);
	const [dismissed, setDismissed] = useState<Set<string>>(new Set());
	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect
		setDismissed(readDismissed());
		setHydrated(true);
	}, []);

	const opps = data.opportunities;
	const undismissed = opps.filter(op => !dismissed.has(checkInSignature(op)));

	const dismiss = () => {
		// Snapshot exactly the current batch — drops stale signatures and keeps the set bounded.
		const signatures = opps.map(checkInSignature);
		setDismissed(new Set(signatures));
		writeDismissed(signatures);
	};

	return { hydrated, undismissed, dismiss };
}

/**
 * Review banner for pending auto follow-ups — Offertum-drafted check-ins for opportunities that
 * have gone silent. Presentational: receives the already-undismissed list + a dismiss handler from
 * {@link usePendingFollowUps} (owned by `OppInsights`). Renders nothing when the list is empty.
 * Each row deep-links to the opportunity's draft for one-click review.
 */
export function PendingFollowUpsBanner({
	opportunities,
	onDismiss
}: {
	opportunities: Opportunity[];
	onDismiss: () => void;
}) {
	const { tokens } = useTheme();
	const navigate = useNavigate();

	const c = tokens.color;
	const visible = opportunities.slice(0, MAX_VISIBLE);
	const overflow = opportunities.length - visible.length;

	return (
		<Paper variant='outlined' sx={{ p: 0, overflow: 'hidden', borderColor: c.accent[300] }}>
			{/* Slim header — plain accent (the flowing gradient now lives on the insights toggle).
			    Carries the context line + the dismiss control; the count itself is on the toggle. */}
			<Box
				sx={{
					display: 'flex',
					alignItems: 'center',
					gap: 1.5,
					py: 1.25,
					px: 2,
					backgroundColor: c.accent[50],
					borderBottom: `1px solid ${c.accent[300]}`
				}}
			>
				<Box
					sx={{
						width: 28,
						height: 28,
						borderRadius: `${tokens.radius.sm}px`,
						backgroundColor: c.accent[500],
						color: '#fff',
						display: 'inline-flex',
						alignItems: 'center',
						justifyContent: 'center',
						flexShrink: 0
					}}
				>
					<AppIcon name='sparkles' size='small' />
				</Box>
				<BodySmall color={c.accent[700]} sx={{ minWidth: 0, flex: 1 }}>
					Offertum heeft concepten klaarstaan voor klanten die stil zijn geworden.
				</BodySmall>
				<IconButton
					aria-label='Verberg tot een nieuwe follow-up'
					onClick={onDismiss}
					size='small'
					sx={{ color: c.ink3, flexShrink: 0, mr: -0.5 }}
				>
					<AppIcon name='x' size='small' />
				</IconButton>
			</Box>

			{visible.map(op => (
				<PendingRow
					key={op.id}
					opportunity={op}
					onOpen={() => navigate({ to: '/opportunities/$id', params: { id: op.id } })}
				/>
			))}

			{overflow > 0 && (
				<ButtonBase
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
						py: 1.5,
						px: 2.5,
						color: c.accent[700],
						fontFamily: tokens.font.sans,
						fontSize: 13,
						fontWeight: 'bold',
						cursor: 'pointer',
						transition: `background ${tokens.motion.durFast}ms`,
						'&:hover': { backgroundColor: c.paper2 }
					}}
				>
					Toon alle {opportunities.length} follow-ups <AppIcon name='arrow-right' size='small' />
				</ButtonBase>
			)}
		</Paper>
	);
}

function PendingRow({ opportunity, onOpen }: { opportunity: Opportunity; onOpen: () => void }) {
	const { tokens } = useTheme();
	const c = tokens.color;
	const silentDaysLabel = opportunity.replyDraftSentAt ? toDaysSinceLabel(opportunity.replyDraftSentAt) : null;

	return (
		<ButtonBase
			tabIndex={0}
			onClick={onOpen}
			onKeyDown={e => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					onOpen();
				}
			}}
			sx={{
				width: '100%',
				display: 'flex',
				alignItems: 'center',
				gap: 2,
				py: 1.5,
				px: 2.5,
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
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, color: c.ink3, fontSize: 12, mt: 0.25 }}>
					<Box component='span' sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
						<AppIcon name='file-text' size='small' />
						Concept gereed
					</Box>
					{silentDaysLabel !== null && (
						<>
							<Box component='span' sx={{ color: c.lineStrong }}>
								·
							</Box>
							<Box component='span' sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
								<AppIcon name='clock' size='small' />
								Stil sinds {silentDaysLabel}
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
		</ButtonBase>
	);
}

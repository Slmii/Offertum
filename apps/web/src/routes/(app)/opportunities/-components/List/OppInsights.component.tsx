import { AppIcon } from '@/components/AppIcon.component';
import { FlowingGradient } from '@/components/FlowingGradient.component';
import { PatternBanners } from '@/components/PatternBanners.component';
import { BodySmall } from '@/components/Text.component';
import { patternsQueryOptions } from '@/lib/queries/patterns.queries';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Collapse from '@mui/material/Collapse';
import Stack from '@mui/material/Stack';
import { useTheme } from '@mui/material/styles';
import { pluralize } from '@offertum/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { PendingFollowUpsBanner, usePendingFollowUps } from './PendingFollowUpsBanner.component';

const INSIGHTS_OPEN_KEY = 'offertum.insights.open';

function readOpen(): boolean {
	try {
		return localStorage.getItem(INSIGHTS_OPEN_KEY) === '1';
	} catch {
		return false;
	}
}

/**
 * Collapsible "smart prioritization" bar for the opportunities list (ported from the design's
 * `OppInsights`). The pending-follow-up tray and the AI pattern tips used to stack as full cards
 * above the list, pushing it below the fold. They now live behind one slim summary bar that's
 * collapsed by default — the list is visible immediately, insights are one click away.
 *
 * Only rendered for entitled orgs (non-entitled get the upsell teaser instead). Renders nothing
 * when there's nothing to surface, so the list goes straight to the top.
 */
export function OppInsights() {
	const { tokens } = useTheme();
	const c = tokens.color;

	const { hydrated, undismissed, dismiss } = usePendingFollowUps();
	const { data: patterns } = useSuspenseQuery(patternsQueryOptions);

	// Collapsed by default; the persisted preference is restored after mount so SSR + the first
	// client render agree (no hydration mismatch).
	const [open, setOpen] = useState(false);
	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect
		setOpen(readOpen());
	}, []);

	const toggle = () => {
		const next = !open;
		setOpen(next);
		try {
			localStorage.setItem(INSIGHTS_OPEN_KEY, next ? '1' : '0');
		} catch {
			// localStorage unavailable (private mode / SSR) — preference just won't persist.
		}
	};

	// Gate the follow-up count on hydration (matches the banner) so an already-dismissed batch
	// doesn't briefly inflate the summary on refresh.
	const followCount = hydrated ? undismissed.length : 0;
	const patternCount = patterns.length;

	if (followCount + patternCount === 0) {
		return null;
	}

	const hasFollow = followCount > 0;
	const parts: string[] = [];
	if (followCount > 0) {
		parts.push(`${followCount} ${pluralize(followCount, 'follow-up wacht', 'follow-ups wachten')}`);
	}
	if (patternCount > 0) {
		parts.push(`${patternCount} ${pluralize(patternCount, 'tip van Offertum', 'tips van Offertum')}`);
	}

	// The clickable summary. When follow-ups are waiting it rides on the flowing accent gradient
	// (white text); otherwise it's a plain bar. Gradient lives on this toggle — not the inner
	// follow-up banner — so the eye-catcher is visible even while the bar is collapsed.
	const toggleButton = (
		<ButtonBase
			onClick={toggle}
			aria-expanded={open}
			sx={{
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'flex-start',
				gap: 1.5,
				width: '100%',
				py: 1.25,
				px: 1.75,
				textAlign: 'left',
				backgroundColor: hasFollow ? 'transparent' : open ? c.surface : c.paper2
			}}
		>
			<Box
				component='span'
				sx={{
					width: 28,
					height: 28,
					borderRadius: `${tokens.radius.sm}px`,
					flexShrink: 0,
					backgroundColor: hasFollow ? 'rgba(255, 255, 255, 0.16)' : c.surface,
					border: `1px solid ${hasFollow ? 'rgba(255, 255, 255, 0.30)' : c.lineStrong}`,
					color: hasFollow ? '#fff' : c.accent[700],
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center'
				}}
			>
				<AppIcon name='sparkles' size='small' />
			</Box>
			<Box sx={{ flex: 1, minWidth: 0 }}>
				<BodySmall component='span' fontWeight='bold' sx={{ color: hasFollow ? '#fff' : c.ink1 }}>
					{parts.join('  ·  ')}
				</BodySmall>
			</Box>
			<Box
				component='span'
				sx={{
					display: 'inline-flex',
					alignItems: 'center',
					gap: 0.5,
					flexShrink: 0,
					color: hasFollow ? '#fff' : c.accent[700],
					fontSize: 13,
					fontWeight: 'bold'
				}}
			>
				{open ? 'Verberg' : 'Toon'}
				<AppIcon name={open ? 'chevron-up' : 'chevron-down'} size='small' />
			</Box>
		</ButtonBase>
	);

	return (
		<Box
			sx={{
				mb: 3,
				border: `1px solid ${hasFollow ? c.accent[300] : c.line}`,
				borderRadius: `${tokens.radius.md}px`,
				backgroundColor: c.surface,
				overflow: 'hidden'
			}}
		>
			{/* Summary row — always visible, click to toggle. */}
			{hasFollow ? <FlowingGradient>{toggleButton}</FlowingGradient> : toggleButton}

			{/* Expanded detail — the full follow-up tray + pattern tips, MUI-animated open/closed. */}
			<Collapse in={open} timeout='auto' unmountOnExit>
				<Stack useFlexGap spacing={2} sx={{ p: 2, border: `1px solid ${c.line}` }}>
					{undismissed.length > 0 && (
						<PendingFollowUpsBanner opportunities={undismissed} onDismiss={dismiss} />
					)}
					{patternCount > 0 && <PatternBanners />}
				</Stack>
			</Collapse>
		</Box>
	);
}

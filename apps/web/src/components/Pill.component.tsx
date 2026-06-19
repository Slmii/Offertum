import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';
import { useTheme } from '@mui/material/styles';
import type { ReactNode } from 'react';

/**
 * Status pill — ported from the design system's `Pill`. A small tinted chip with an optional
 * leading dot, backed by the theme's status tokens (50 = tint bg, 700 = text, 500 = dot) so
 * colors stay centralized. DRY replacement for the inline status pills in the lists.
 */
export type PillTone = 'accent' | 'won' | 'pending' | 'lost' | 'cold' | 'info' | 'neutral';

/**
 * Per-tone color triplet (tint bg / text fg / dot), resolved from the theme's status tokens.
 * Exported so siblings that render a leading dot in the same tones (e.g. `PillSelect`'s menu)
 * stay in sync with the pill itself.
 */
export function pillTonePalette(tokens: Theme['tokens']): Record<PillTone, { bg: string; fg: string; dot: string }> {
	const c = tokens.color;
	return {
		accent: { bg: c.accent[50], fg: c.accent[700], dot: c.accent[500] },
		won: { bg: c.won[50], fg: c.won[700], dot: c.won[500] },
		pending: { bg: c.pending[50], fg: c.pending[700], dot: c.pending[500] },
		lost: { bg: c.lost[50], fg: c.lost[700], dot: c.lost[500] },
		cold: { bg: c.cold[50], fg: c.cold[700], dot: c.cold[500] },
		info: { bg: c.info[50], fg: c.info[700], dot: c.info[500] },
		neutral: { bg: c.paper3, fg: c.ink2, dot: c.ink3 }
	};
}

interface PillProps {
	tone?: PillTone;
	dot?: boolean;
	children: ReactNode;
	sx?: SxProps<Theme>;
}

export function Pill({ tone = 'neutral', dot = false, children, sx }: PillProps) {
	const { tokens } = useTheme();
	const t = pillTonePalette(tokens)[tone];

	return (
		<Box
			component='span'
			sx={[
				{
					display: 'inline-flex',
					alignItems: 'center',
					gap: 0.75,
					px: 1.125,
					py: '3px',
					borderRadius: `${tokens.radius.sm}px`,
					backgroundColor: t.bg,
					color: t.fg,
					fontSize: 12,
					fontWeight: 'medium',
					lineHeight: 1.4,
					whiteSpace: 'nowrap'
				},
				...(Array.isArray(sx) ? sx : [sx])
			]}
		>
			{dot && (
				<Box
					component='span'
					sx={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: t.dot, flexShrink: 0 }}
				/>
			)}
			{children}
		</Box>
	);
}

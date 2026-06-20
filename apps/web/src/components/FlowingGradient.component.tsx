import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';
import { useTheme } from '@mui/material/styles';
import type { ReactNode } from 'react';

interface FlowingGradientProps {
	children?: ReactNode;
	// Layout-only styling for the band (padding, flex, etc.). The animated gradient is built in.
	sx?: SxProps<Theme>;
	// Gradient color stops. For a seamless loop the list should be a palindrome (first === last).
	// Defaults to the design's vibrant Investment-Indigo flow (accent 700 → 500 → 300 → 500 → 700).
	colors?: string[];
	// Duration of one full flow cycle, ms. Lower = faster / more obvious.
	durationMs?: number;
	// Gradient direction in CSS degrees (0 = up, 90 = →). Design uses 100° (a slight diagonal).
	angleDeg?: number;
}

/**
 * A surface with a gradient that flows left → right on a seamless loop — for parts of the UI we
 * want to draw attention to (e.g. the pending-follow-ups banner header). Ported from the design's
 * `.qm-followup-flow`: a wide accent gradient scrolled via `background-position`. DRY +
 * token-driven; just wrap content in it. Honors `prefers-reduced-motion` (the gradient holds still).
 */
export function FlowingGradient({ children, sx, colors, durationMs = 6000, angleDeg = 100 }: FlowingGradientProps) {
	const { tokens } = useTheme();
	const c = tokens.color;
	const stops = colors ?? [c.accent[700], c.accent[500], c.accent[300], c.accent[500], c.accent[700]];
	const gradient = `linear-gradient(${angleDeg}deg, ${stops
		.map((color, i) => `${color} ${Math.round((i / (stops.length - 1)) * 100)}%`)
		.join(', ')})`;

	return (
		<Box
			sx={[
				{
					backgroundImage: gradient,
					// 2×-wide gradient scrolled across the band — symmetric stops make 0%→200% seamless.
					backgroundSize: '200% 100%',
					'@keyframes flowing-gradient': {
						'0%': { backgroundPosition: '0% 50%' },
						'100%': { backgroundPosition: '200% 50%' }
					},
					animation: `flowing-gradient ${durationMs}ms linear infinite`,
					'@media (prefers-reduced-motion: reduce)': { animation: 'none' }
				},
				...(Array.isArray(sx) ? sx : [sx])
			]}
		>
			{children}
		</Box>
	);
}

import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';
import { useTheme } from '@mui/material/styles';

/**
 * Initials avatar — ported from the design system's `Avatar`. Square with a small radius
 * (4px ≤24, else 6px), neutral by default or accent-tinted. DRY replacement for the inline
 * initials blocks scattered across the shell/team/search.
 */
interface AvatarProps {
	name: string;
	size?: number;
	// Accent-tinted variant (e.g. the current org/user); default is the neutral paper chip.
	accent?: boolean;
	sx?: SxProps<Theme>;
}

function initialsOf(name: string): string {
	return (
		name
			.split(' ')
			.map(part => part[0])
			.filter(Boolean)
			.slice(0, 2)
			.join('')
			.toUpperCase() || '—'
	);
}

export function Avatar({ name, size = 28, accent = false, sx }: AvatarProps) {
	const { tokens } = useTheme();
	return (
		<Box
			component='span'
			aria-hidden='true'
			sx={[
				{
					width: size,
					height: size,
					borderRadius: `${size <= 24 ? tokens.radius.sm : tokens.radius.md}px`,
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
					flexShrink: 0,
					fontWeight: 'bold',
					fontSize: Math.round(size * 0.4),
					backgroundColor: accent ? tokens.color.accent[100] : tokens.color.paper3,
					color: accent ? tokens.color.accent[700] : tokens.color.ink2
				},
				...(Array.isArray(sx) ? sx : [sx])
			]}
		>
			{initialsOf(name)}
		</Box>
	);
}

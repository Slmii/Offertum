import { AppIcon } from '@/components/AppIcon.component';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';

/** Accent-tinted lock tile shared by every upsell surface (teaser, locked panels, subscribe modal). */
export function UpsellLockTile({ size = 44 }: { size?: number }) {
	const { tokens } = useTheme();
	return (
		<Box
			sx={{
				width: size,
				height: size,
				flexShrink: 0,
				borderRadius: `${tokens.radius.md}px`,
				backgroundColor: tokens.color.accent[50],
				border: `1px solid ${tokens.color.accent[300]}`,
				color: tokens.color.accent[700],
				display: 'inline-flex',
				alignItems: 'center',
				justifyContent: 'center'
			}}
		>
			<AppIcon name='lock' size={size >= 48 ? 'large' : 'medium'} />
		</Box>
	);
}

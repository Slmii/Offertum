import { AppIcon } from '@/components/AppIcon.component';
import { BodySmall } from '@/components/Text.component';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import { useTheme } from '@mui/material/styles';
import type { ReactNode } from 'react';

/** One value-prop row (accent check-circle + text) shared by the upsell surfaces. */
export function UpsellCheckItem({ children }: { children: ReactNode }) {
	const { tokens } = useTheme();
	return (
		<Stack direction='row' useFlexGap spacing={1.25} sx={{ alignItems: 'flex-start' }}>
			<Box
				sx={{
					width: 18,
					height: 18,
					flexShrink: 0,
					mt: '1px',
					borderRadius: '50%',
					backgroundColor: tokens.color.accent[50],
					color: tokens.color.accent[700],
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center'
				}}
			>
				<AppIcon name='check' size='small' />
			</Box>
			<BodySmall sx={{ color: tokens.color.ink2 }}>{children}</BodySmall>
		</Stack>
	);
}

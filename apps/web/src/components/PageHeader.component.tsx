import { Body, H1 } from '@/components/Text.component';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import { useTheme } from '@mui/material/styles';
import type { ReactNode } from 'react';

interface PageHeaderProps {
	title: string;
	caption?: ReactNode;
	actions?: ReactNode;
	disableMargin?: boolean;
}

export function PageHeader({ title, caption, actions, disableMargin }: PageHeaderProps) {
	const { tokens } = useTheme();
	return (
		<Box
			sx={{
				display: 'flex',
				alignItems: 'flex-end',
				justifyContent: 'space-between',
				gap: 3,
				mb: disableMargin ? 0 : 3
			}}
		>
			<Stack useFlexGap spacing={1}>
				<H1>{title}</H1>
				{caption && <Body sx={{ color: tokens.color.ink3 }}>{caption}</Body>}
			</Stack>
			{actions && <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexShrink: 0 }}>{actions}</Box>}
		</Box>
	);
}

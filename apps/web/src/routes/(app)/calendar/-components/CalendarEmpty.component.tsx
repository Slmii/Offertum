import { AppIcon } from '@/components/AppIcon.component';
import { Body, BodySmall } from '@/components/Text.component';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';

/**
 * Empty state for the calendar (the design's `CalEmpty`) — used as FullCalendar's `noEventsContent`,
 * so the agenda view shows this bordered card instead of "No events to display". The design's
 * "Open inbox" CTA is intentionally omitted.
 */
export function CalendarEmpty() {
	const { tokens } = useTheme();
	return (
		<Box
			sx={{
				textAlign: 'center',
				p: 6,
				backgroundColor: tokens.color.surface,
				border: `1px solid ${tokens.color.line}`,
				borderRadius: `${tokens.radius.lg}px`
			}}
		>
			<Box
				sx={{
					width: 48,
					height: 48,
					mx: 'auto',
					mb: 1.75,
					borderRadius: '50%',
					backgroundColor: tokens.color.paper2,
					color: tokens.color.ink3,
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center'
				}}
			>
				<AppIcon name='calendar' size='large' />
			</Box>
			<Body fontWeight='bold' color='text.primary' sx={{ fontSize: 16, mb: 0.75 }}>
				Geen activiteit deze maand.
			</Body>
			<BodySmall sx={{ display: 'block', maxWidth: 420, mx: 'auto', fontSize: 14, color: tokens.color.ink3 }}>
				Verstuur je eerste offerte vanuit de inbox om hier de tijdlijn te zien opbouwen.
			</BodySmall>
		</Box>
	);
}

import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';

/**
 * Today's month day-number rendered as a centered accent circle (the design's today marker). Used
 * via FullCalendar's `dayCellContent` so the glyph is flex-centered in the circle rather than
 * fighting the cell `<a>` + serif font metrics with CSS.
 */
export function CalendarTodayNumber({ day }: { day: number }) {
	const { tokens } = useTheme();
	return (
		<Box
			sx={{
				display: 'inline-flex',
				alignItems: 'center',
				justifyContent: 'center',
				width: 26,
				height: 26,
				pb: 0.5,
				borderRadius: '50%',
				backgroundColor: tokens.color.accent[500],
				color: tokens.color.accent.fg,
				fontFamily: tokens.font.display,
				fontSize: 15,
				lineHeight: 1
			}}
		>
			{day}
		</Box>
	);
}

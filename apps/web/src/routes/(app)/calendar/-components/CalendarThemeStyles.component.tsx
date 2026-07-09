import GlobalStyles from '@mui/material/GlobalStyles';

/**
 * Themes FullCalendar to the Offertum design system — scoped under `.oc-calendar`. FullCalendar
 * ships its own CSS; we override its custom properties + a handful of element classes so borders,
 * surfaces, weekday headers, the today marker, time-grid, the agenda list, and the "+N meer"
 * popover all read on-brand.
 */
export function CalendarThemeStyles() {
	return (
		<GlobalStyles
			styles={theme => {
				const c = theme.tokens.color;
				return {
					'.oc-calendar .fc': {
						fontFamily: theme.tokens.font.sans,
						fontSize: 13,
						color: c.ink2,
						'--fc-border-color': c.line,
						'--fc-page-bg-color': c.surface,
						'--fc-neutral-bg-color': c.paper2,
						'--fc-today-bg-color': 'transparent',
						'--fc-now-indicator-color': c.accent[500],
						'--fc-list-event-hover-bg-color': c.paper2
					},
					'.oc-calendar .fc-view-harness, .oc-calendar .fc .fc-scrollgrid': { borderColor: c.line },
					'.oc-calendar .fc-theme-standard .fc-scrollgrid': {
						border: `1px solid ${c.line}`,
						borderRadius: `${theme.tokens.radius.lg}px`,
						overflow: 'hidden',
						backgroundColor: c.surface
					},
					// Weekday column headers — uppercase muted labels.
					'.oc-calendar .fc .fc-col-header-cell-cushion': {
						padding: '10px 12px',
						fontSize: 11,
						fontWeight: 600,
						letterSpacing: '0.04em',
						textTransform: 'uppercase',
						color: c.ink3,
						textDecoration: 'none'
					},
					// Every month cell keeps a consistent height, even with no events.
					'.oc-calendar .fc-daygrid-day-frame': { minHeight: 140 },
					// Day-number row: left-aligned (design) with breathing room above the events.
					'.oc-calendar .fc-daygrid-day-top': { flexDirection: 'row', padding: '4px 4px 0' },
					'.oc-calendar .fc .fc-daygrid-day-number': {
						fontFamily: theme.tokens.font.display,
						fontSize: 16,
						fontWeight: 500,
						color: c.ink1,
						padding: 2,
						textDecoration: 'none'
					},
					'.oc-calendar .fc .fc-day-other': { backgroundColor: c.paper2 },
					'.oc-calendar .fc .fc-day-other .fc-daygrid-day-number': { color: c.ink4 },
					// Today's accent circle is rendered via `dayCellContent` (CalendarTodayNumber); drop the
					// cell's own number padding so the circle isn't offset. Week header gets accent ink.
					'.oc-calendar .fc .fc-daygrid-day.fc-day-today .fc-daygrid-day-number': { padding: 0 },
					'.oc-calendar .fc .fc-day-today .fc-col-header-cell-cushion': { color: c.accent[700] },
					// Day-grid events render transparent (the dot in EventContent carries the type); the
					// per-type tint only appears on hover, matching the design.
					// `!important` overrides FullCalendar's inline per-event background — otherwise all-day
					// (block) events keep their tinted bar while timed (dot) events are transparent. We want
					// every month event to read as the dot + text row (EventContent), tinting only on hover.
					'.oc-calendar .fc-daygrid-event, .oc-calendar .fc-daygrid-event:hover': {
						backgroundColor: 'transparent !important',
						border: 'none !important',
						boxShadow: 'none'
					},
					'.oc-calendar .fc-daygrid-day-events': { marginTop: 4, padding: '0 4px 6px' },
					'.oc-calendar .fc-daygrid-event-harness': { marginTop: 3 },
					'.oc-calendar .fc .fc-daygrid-more-link': {
						fontSize: 11,
						fontWeight: 500,
						color: c.ink3,
						padding: '2px 4px'
					},
					// Time grid (week) — quiet hour labels; timed events keep FullCalendar's tinted chip with a
					// left edge and a subtle darken on hover. (All-day events render as the transparent month
					// dot+text row instead — they're `.fc-daygrid-event`, styled above.)
					'.oc-calendar .fc .fc-timegrid-slot-label-cushion, .oc-calendar .fc .fc-timegrid-axis-cushion': {
						fontSize: 11,
						color: c.ink4
					},
					'.oc-calendar .fc-timegrid-event, .oc-calendar .fc-timegrid-event .fc-event-main': {
						borderRadius: 4
					},
					'.oc-calendar .fc-timegrid-event': { borderLeftWidth: 3, transition: 'filter 150ms' },
					'.oc-calendar .fc-timegrid-event:hover': { filter: 'brightness(0.96)' },
					'.oc-calendar .fc-event': { cursor: 'pointer' },
					// Current-time line spans the whole week, not just today's column. FullCalendar clips it
					// to the column via the container's `overflow: hidden`; make that visible, extend the
					// line far in both directions, and clip at the columns box so it adds no horizontal scroll.
					'.oc-calendar .fc-timegrid-cols': { overflowX: 'clip' },
					'.oc-calendar .fc-timegrid-now-indicator-container': { overflow: 'visible' },
					'.oc-calendar .fc-timegrid-now-indicator-line': { left: -2000, right: -2000 },
					// "+N meer" uses our own portaled MUI popover (CalendarMorePopover); FullCalendar's own
					// popover is suppressed at the source (moreLinkClick returns truthy). This rule is a
					// belt-and-suspenders hide in case an FC edge path still mounts it (it isn't portaled, so
					// it would clip on the scroll container).
					'.oc-calendar .fc-popover': { display: 'none' },
					// Agenda (list) — group headers on paper-2, hover tint, hairline rows.
					'.oc-calendar .fc-theme-standard .fc-list': {
						border: `1px solid ${c.line}`,
						borderRadius: `${theme.tokens.radius.lg}px`,
						overflow: 'hidden'
					},
					'.oc-calendar .fc .fc-list-day-cushion': { backgroundColor: c.paper2 },
					'.oc-calendar .fc .fc-list-day-text, .oc-calendar .fc .fc-list-day-side-text': {
						fontFamily: theme.tokens.font.display,
						fontWeight: 500,
						color: c.ink1,
						textDecoration: 'none'
					},
					'.oc-calendar .fc .fc-list-event-time': { color: c.ink3 },
					// Each agenda row is fully clickable: the title cell holds a stretched ButtonBase overlay
					// (EventContent), so the row is the positioning context for the overlay's `inset: 0`.
					'.oc-calendar .fc .fc-list-event': { position: 'relative' }
				};
			}}
		/>
	);
}

// apps/web/src/routes/(app)/calendar/index.tsx
import { calendarEventsQueryOptions } from '@/lib/queries/calendar.queries';
import { calendarEventColor, calendarEventLabel } from '@/lib/utils/calendar.utils';
import dayGridPlugin from '@fullcalendar/daygrid';
import listPlugin from '@fullcalendar/list';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { CALENDAR_EVENT_SCOPES, CALENDAR_EVENT_TYPES, type CalendarEventScope } from '@offertum/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { z } from 'zod';

// The route prefetches a single wide window (−60d…+180d) and passes it to FullCalendar as a
// static events array. Month/week navigation stays within this window without refetching; this
// covers normal navigation. (A datesSet→query handler could widen it later if needed.)
const WINDOW_PAST_DAYS = 60;
const WINDOW_FUTURE_DAYS = 180;
const DAY_MS = 24 * 60 * 60 * 1000;

// Anchored to the START of the current UTC day — NOT `Date.now()`. The window string feeds the
// query key; if it carried millisecond precision it would differ between the loader call and
// every component render, so `useSuspenseQuery` would miss the prefetched cache and refetch on
// every render (an infinite loop that trips the rate limiter). Day granularity makes the key
// stable across the loader + all renders within the same day.
function windowRange(): { from: string; to: string } {
	const now = new Date();
	const startOfDayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
	return {
		from: new Date(startOfDayMs - WINDOW_PAST_DAYS * DAY_MS).toISOString(),
		to: new Date(startOfDayMs + WINDOW_FUTURE_DAYS * DAY_MS).toISOString()
	};
}

const SearchSchema = z.object({
	scope: z.enum(CALENDAR_EVENT_SCOPES as [CalendarEventScope, ...CalendarEventScope[]]).optional()
});

export const Route = createFileRoute('/(app)/calendar/')({
	validateSearch: SearchSchema,
	// The in-app calendar read is open to any member (not subscription-gated) — only the iCal
	// phone-sync setup (the /settings/calendar page + the feed-token API) requires a subscription.
	loaderDeps: ({ search }) => ({ scope: search.scope ?? 'all' }),
	loader: ({ context, deps }) => {
		const { from, to } = windowRange();
		return context.queryClient.ensureQueryData(calendarEventsQueryOptions(from, to, deps.scope));
	},
	component: CalendarPage
});

function CalendarPage() {
	const { scope } = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const activeScope: CalendarEventScope = scope ?? 'all';
	// Memoized so the window (and thus the query key) is computed once per mount, never per render.
	const { from, to } = useMemo(() => windowRange(), []);
	const { data: events } = useSuspenseQuery(calendarEventsQueryOptions(from, to, activeScope));

	// FullCalendar is a client-only widget (it touches the DOM and reads window size for the
	// responsive view). Gate its render behind a mounted flag so SSR emits no calendar markup
	// and there's no hydration mismatch. Data is already SSR-prefetched via the loader, so this
	// only defers the calendar chrome, not the fetch.
	const [mounted, setMounted] = useState(false);
	useEffect(() => {
		// One-time mount flag so the client-only FullCalendar renders after hydration. This is the
		// legitimate "render after mount" pattern (single bounded re-render), not a state mirror —
		// same documented exception the opportunities route uses for its URL↔input effects.
		// eslint-disable-next-line react-hooks/set-state-in-effect
		setMounted(true);
	}, []);
	const initialView = mounted && window.innerWidth < 768 ? 'listWeek' : 'dayGridMonth';

	const fcEvents = events.map(event => ({
		id: event.id,
		title: event.title,
		start: event.at,
		allDay: event.allDay,
		backgroundColor: calendarEventColor(event.type),
		borderColor: calendarEventColor(event.type),
		extendedProps: { opportunityId: event.opportunityId, type: event.type }
	}));

	return (
		<Container sx={{ py: 3 }}>
			<Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
				<Typography variant='h1' sx={{ fontSize: 28 }}>
					Agenda
				</Typography>
				<FormControlLabel
					control={
						<Switch
							checked={activeScope === 'mine'}
							onChange={(_, checked) =>
								navigate({
									search: prev => ({ ...prev, scope: checked ? 'mine' : undefined }),
									replace: true
								})
							}
						/>
					}
					label='Aan mij toegewezen'
				/>
			</Box>
			<Stack direction='row' spacing={2} sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}>
				{CALENDAR_EVENT_TYPES.map(type => (
					<Box key={type} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
						<Box
							sx={{
								width: 12,
								height: 12,
								borderRadius: '2px',
								backgroundColor: calendarEventColor(type)
							}}
						/>
						<Typography variant='caption' color='text.secondary'>
							{calendarEventLabel(type)}
						</Typography>
					</Box>
				))}
			</Stack>
			{mounted ? (
				<FullCalendar
					plugins={[dayGridPlugin, timeGridPlugin, listPlugin]}
					initialView={initialView}
					headerToolbar={{
						left: 'prev,next today',
						center: 'title',
						right: 'dayGridMonth,timeGridWeek,listWeek'
					}}
					locale='nl'
					firstDay={1}
					height='auto'
					events={fcEvents}
					eventClick={info => {
						const opportunityId = info.event.extendedProps.opportunityId as string;
						void navigate({ to: '/opportunities/$id', params: { id: opportunityId } });
					}}
				/>
			) : null}
		</Container>
	);
}

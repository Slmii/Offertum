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
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { CALENDAR_EVENT_SCOPES, type CalendarEventScope } from '@offertum/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { z } from 'zod';

// Visible window the loader prefetches. FullCalendar then refetches via the events query
// as the user navigates months; the route keeps a wide static window so first paint is full.
const WINDOW_PAST_DAYS = 60;
const WINDOW_FUTURE_DAYS = 180;
const DAY_MS = 24 * 60 * 60 * 1000;

function windowRange(): { from: string; to: string } {
	const now = Date.now();
	return {
		from: new Date(now - WINDOW_PAST_DAYS * DAY_MS).toISOString(),
		to: new Date(now + WINDOW_FUTURE_DAYS * DAY_MS).toISOString()
	};
}

const SearchSchema = z.object({
	scope: z.enum(CALENDAR_EVENT_SCOPES as [CalendarEventScope, ...CalendarEventScope[]]).optional()
});

export const Route = createFileRoute('/(app)/calendar/')({
	validateSearch: SearchSchema,
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
	const { from, to } = windowRange();
	const { data: events } = useSuspenseQuery(calendarEventsQueryOptions(from, to, activeScope));

	// FullCalendar is a client-only widget (it touches the DOM and reads window size for the
	// responsive view). Gate its render behind a mounted flag so SSR emits no calendar markup
	// and there's no hydration mismatch. Data is already SSR-prefetched via the loader, so this
	// only defers the calendar chrome, not the fetch.
	const [mounted, setMounted] = useState(false);
	useEffect(() => {
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
								navigate({ search: prev => ({ ...prev, scope: checked ? 'mine' : undefined }), replace: true })
							}
						/>
					}
					label='Aan mij toegewezen'
				/>
			</Box>
			{mounted ? (
				<FullCalendar
					plugins={[dayGridPlugin, timeGridPlugin, listPlugin]}
					initialView={initialView}
					headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,listWeek' }}
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

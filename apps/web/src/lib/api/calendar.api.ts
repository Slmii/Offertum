import { serverFetch } from '@/lib/api/server-fetch';
import type { CalendarEvent, CalendarEventScope, IcalFeed } from '@offertum/shared';
import { createServerFn } from '@tanstack/react-start';

export interface ListCalendarEventsInput {
	from: string; // ISO
	to: string; // ISO
	scope: CalendarEventScope;
}

/** GET /api/calendar/events — isomorphic SSR + client read for FullCalendar. */
export const listCalendarEventsServer = createServerFn({ method: 'GET' })
	.inputValidator((data: ListCalendarEventsInput) => data)
	.handler(async ({ data }): Promise<CalendarEvent[]> => {
		const params = new URLSearchParams({ from: data.from, to: data.to });
		if (data.scope !== 'all') {
			params.set('scope', data.scope);
		}
		const response = await serverFetch(`/api/calendar/events?${params.toString()}`);
		if (!response.ok) {
			throw new Error(`Failed to load calendar events (${response.status})`);
		}
		return (await response.json()) as CalendarEvent[];
	});

/** GET /api/calendar/ical/token — current feed URL (null when disabled). */
export const getCalendarFeedServer = createServerFn({ method: 'GET' }).handler(async (): Promise<IcalFeed> => {
	const response = await serverFetch('/api/calendar/ical/token');
	if (!response.ok) {
		throw new Error(`Failed to load calendar feed (${response.status})`);
	}
	return (await response.json()) as IcalFeed;
});

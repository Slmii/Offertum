import { api } from '@/lib/api/client';
import { getCalendarFeedServer, listCalendarEventsServer } from '@/lib/api/calendar.api';
import type { IcalFeed } from '@offertum/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

export const CalendarKeys = {
	all: ['calendar'] as const,
	events: (from: string, to: string) => ['calendar', 'events', { from, to }] as const,
	feed: ['calendar', 'feed'] as const
};

/** Events for a visible window (always the requesting user's own assignments). Short staleTime so
 * fresh quotes/appointments surface fast. */
export const calendarEventsQueryOptions = (from: string, to: string) =>
	queryOptions({
		queryKey: CalendarKeys.events(from, to),
		queryFn: () => listCalendarEventsServer({ data: { from, to } }),
		staleTime: 15_000
	});

export const calendarFeedQueryOptions = queryOptions({
	queryKey: CalendarKeys.feed,
	queryFn: () => getCalendarFeedServer()
});

export function useGenerateCalendarFeed() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => api<IcalFeed>('/api/calendar/ical/token', { method: 'POST' }),
		onSuccess: feed => queryClient.setQueryData<IcalFeed>(CalendarKeys.feed, feed)
	});
}

export function useRevokeCalendarFeed() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => api<void>('/api/calendar/ical/token', { method: 'DELETE' }),
		onSuccess: () => queryClient.setQueryData<IcalFeed>(CalendarKeys.feed, { url: null })
	});
}

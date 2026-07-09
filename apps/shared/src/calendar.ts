// apps/shared/src/calendar.ts

/** The four date kinds Offertum projects onto the calendar. */
export type CalendarEventType = 'expiry' | 'appointment' | 'deadline' | 'follow_up';

/** Whose opportunities the calendar/feed shows. `mine` = assigned to the requesting user. */
export type CalendarEventScope = 'mine' | 'all';

export const CALENDAR_EVENT_TYPES: readonly CalendarEventType[] = [
	'expiry',
	'appointment',
	'deadline',
	'follow_up'
] as const;

export const CALENDAR_EVENT_SCOPES: readonly CalendarEventScope[] = ['mine', 'all'] as const;

/** One calendar marker on the wire. Dates are ISO strings (see shared/index.ts convention). */
export interface CalendarEvent {
	id: string; // deterministic synthetic key, stable across refetches: `${sourceId}:${type}`
	opportunityId: string;
	type: CalendarEventType;
	title: string;
	at: string; // ISO timestamp
	allDay: boolean;
}

/** iCal feed token status / post-rotation result. `url` is null when the feed is disabled. */
export interface IcalFeed {
	url: string | null;
}

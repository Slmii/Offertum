// apps/api/src/modules/calendar/calendar-event-type.ts
import type { CalendarEventType } from '@offertum/shared';

interface CalendarEventTypeMeta {
	/** Dutch title prefix shown before the customer label, e.g. "Offerte verstuurd". */
	labelPrefix: string;
	/** Whether the event renders as an all-day marker (date only) vs. a timed event. */
	allDay: boolean;
}

/**
 * Per-type presentation metadata. The mapper reads `labelPrefix` + `allDay` from here so
 * adding/retuning a type is a one-line change. Web colors live separately in
 * `apps/web/src/lib/utils/calendar.utils.ts` (the API doesn't own presentation color).
 */
export const CALENDAR_EVENT_TYPE_META: Record<CalendarEventType, CalendarEventTypeMeta> = {
	sent: { labelPrefix: 'Offerte verstuurd', allDay: false },
	expiry: { labelPrefix: 'Offerte verloopt', allDay: true },
	appointment: { labelPrefix: 'Afspraak', allDay: false },
	deadline: { labelPrefix: 'Deadline klant', allDay: true },
	follow_up: { labelPrefix: 'Opvolging', allDay: true }
};

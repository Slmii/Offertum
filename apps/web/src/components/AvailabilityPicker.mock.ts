/**
 * MOCK / DESIGN-FIDELITY LAYER for the AvailabilityPicker surface.
 *
 * The AvailabilityPicker (opportunity detail → "Afspraak" field) shows the owner's
 * calendar busy/free windows so an opname/inspection can be scheduled into a real
 * free slot. The current backend does NOT support this:
 *
 *  - The API `calendar` module aggregates Offertum's OWN pipeline (deadlines /
 *    appointments / quote expiry) into an in-app agenda + outbound iCal feed. It is the
 *    OPPOSITE direction — there is no endpoint that returns provider busy windows for a
 *    date range.
 *  - OAuth scopes don't allow it: Gmail requests `gmail.readonly`, Microsoft requests
 *    `Mail.Read` — neither asks for Google Calendar / Microsoft Calendars.Read, so
 *    busy/free can't be fetched even if an endpoint existed.
 *
 * Everything below is therefore mock data, isolated here so the component renders the
 * full design (date strip, busy-block overlays, free-slot grid) and can later be swapped
 * for a real free/busy endpoint with no UI rewrite. The component reads *connected
 * providers* from the real mailbox status (those ARE backed) and only the busy WINDOWS
 * are mocked.
 *
 * To go live: replace `getMockBusyWindows` with a `createServerFn`/`queryOptions` read of
 * a real `GET /api/calendar/free-busy?from=&to=` endpoint that returns the same
 * `BusyWindow[]`-per-date shape.
 */

/** A busy window on a given day. `allDay` blocks the entire day (weekend, holiday). */
export interface BusyWindow {
	// "HH:mm" — omitted when allDay.
	start?: string;
	end?: string;
	allDay?: boolean;
	// Human label for an all-day block ("Weekend", "Vakantie").
	label?: string;
}

/** The reference "today" the mock strip is anchored to (Thu 21 May 2026). */
export const MOCK_PICKER_TODAY = '2026-05-21';

/** The day the picker opens focused on, per the design brief (Mon 25 May 2026). */
export const MOCK_DEFAULT_SELECTED_DATE = '2026-05-25';

/**
 * MOCK constant — busy windows keyed by `YYYY-MM-DD`. Replace the whole map with a real
 * free/busy fetch; the per-day `BusyWindow[]` shape is the contract the UI consumes.
 */
const MOCK_BUSY: Record<string, BusyWindow[]> = {
	'2026-05-21': [
		{ start: '09:00', end: '12:00' },
		{ start: '14:30', end: '16:00' }
	],
	'2026-05-22': [
		{ start: '09:00', end: '10:00' },
		{ start: '13:00', end: '13:30' }
	],
	'2026-05-23': [{ allDay: true, label: 'Weekend' }],
	'2026-05-24': [{ allDay: true, label: 'Weekend' }],
	'2026-05-25': [
		{ start: '09:00', end: '10:30' },
		{ start: '13:30', end: '14:30' },
		{ start: '16:00', end: '17:00' }
	],
	'2026-05-26': [
		{ start: '08:00', end: '09:30' },
		{ start: '12:30', end: '13:30' },
		{ start: '16:30', end: '17:30' }
	],
	'2026-05-27': [{ allDay: true, label: 'Vakantie' }],
	'2026-05-28': [{ start: '11:00', end: '13:00' }],
	'2026-05-29': [
		{ start: '09:00', end: '11:30' },
		{ start: '15:00', end: '17:30' }
	],
	'2026-05-30': [{ allDay: true, label: 'Weekend' }],
	'2026-05-31': [{ allDay: true, label: 'Weekend' }],
	'2026-06-01': [{ start: '10:00', end: '12:00' }],
	'2026-06-02': [{ start: '14:00', end: '15:30' }],
	'2026-06-03': [{ start: '09:00', end: '10:00' }]
};

/**
 * MOCK — when more than one provider is connected, simulate one provider's free/busy call
 * failing so the "partial result" note renders. Set to `null` to suppress.
 * A real implementation would derive this from per-provider fetch errors.
 */
export const MOCK_PARTIAL_PROVIDER_FAILURE: 'google' | 'microsoft' | null = 'microsoft';

/** Returns the mocked busy windows for a date (empty when the day is fully free). */
export function getMockBusyWindows(dateStr: string): BusyWindow[] {
	return MOCK_BUSY[dateStr] ?? [];
}

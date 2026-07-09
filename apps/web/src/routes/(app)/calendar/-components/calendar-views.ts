import type { CalendarEventType } from '@offertum/shared';

// Shared view model for the calendar page + its toolbar. The ids are FullCalendar view names.
export type CalendarView = 'dayGridMonth' | 'timeGridWeek' | 'listMonth';

export const VIEW_OPTIONS: { id: CalendarView; label: string }[] = [
	{ id: 'dayGridMonth', label: 'Maand' },
	{ id: 'timeGridWeek', label: 'Week' },
	{ id: 'listMonth', label: 'Agenda' }
];

/** Per-day event shape powering the "+N meer" popover (rendered as full event cards). */
export interface CalendarMoreEvent {
	id: string;
	opportunityId: string;
	type: CalendarEventType;
	title: string;
}

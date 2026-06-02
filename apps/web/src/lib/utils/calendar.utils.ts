import type { CalendarEventType } from '@offertum/shared';

const COLORS: Record<CalendarEventType, string> = {
	sent: '#1976d2', // blue
	expiry: '#d32f2f', // red
	appointment: '#2e7d32', // green
	deadline: '#ed6c02', // orange
	follow_up: '#7b1fa2' // purple
};

const LABELS: Record<CalendarEventType, string> = {
	sent: 'Offerte verstuurd',
	expiry: 'Offerte verloopt',
	appointment: 'Afspraak',
	deadline: 'Deadline klant',
	follow_up: 'Opvolging'
};

export function calendarEventColor(type: CalendarEventType): string {
	return COLORS[type];
}

export function calendarEventLabel(type: CalendarEventType): string {
	return LABELS[type];
}

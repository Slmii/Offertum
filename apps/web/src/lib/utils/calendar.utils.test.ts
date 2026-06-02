import { describe, expect, it } from 'vitest';
import { CALENDAR_EVENT_TYPES } from '@offertum/shared';
import { calendarEventColor, calendarEventLabel } from './calendar.utils';

describe('calendar.utils', () => {
	it('returns a distinct color for every event type', () => {
		const colors = CALENDAR_EVENT_TYPES.map(calendarEventColor);
		expect(new Set(colors).size).toBe(CALENDAR_EVENT_TYPES.length);
	});

	it('returns a Dutch label for every event type', () => {
		expect(calendarEventLabel('sent')).toBe('Offerte verstuurd');
		expect(calendarEventLabel('expiry')).toBe('Offerte verloopt');
		expect(calendarEventLabel('appointment')).toBe('Afspraak');
		expect(calendarEventLabel('deadline')).toBe('Deadline klant');
		expect(calendarEventLabel('follow_up')).toBe('Opvolging');
	});
});

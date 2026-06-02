// apps/api/src/lib/calendar/ical-serializer.spec.ts
import { describe, expect, it } from '@jest/globals';
import { serializeICalendar, type ICalEvent } from './ical-serializer';

const PROD_ID = '-//Offertum//Calendar//NL';

function unfold(ics: string): string {
	// RFC 5545 line unfolding: a CRLF followed by a space/tab continues the prior line.
	return ics.replace(/\r\n[ \t]/g, '');
}

describe('serializeICalendar', () => {
	it('wraps events in a VCALENDAR envelope with CRLF line endings', () => {
		const ics = serializeICalendar({ prodId: PROD_ID, dtstamp: new Date('2026-06-02T00:00:00.000Z'), events: [] });
		expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
		expect(ics.includes('VERSION:2.0\r\n')).toBe(true);
		expect(ics.includes(`PRODID:${PROD_ID}\r\n`)).toBe(true);
		expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
	});

	it('emits a timed VEVENT with UTC DTSTART', () => {
		const event: ICalEvent = {
			uid: 'qd-1:sent@offertum',
			summary: 'Offerte verstuurd — Jansen',
			at: new Date('2026-06-01T08:00:00.000Z'),
			allDay: false
		};
		const ics = serializeICalendar({
			prodId: PROD_ID,
			dtstamp: new Date('2026-06-02T00:00:00.000Z'),
			events: [event]
		});
		expect(ics).toContain('UID:qd-1:sent@offertum\r\n');
		expect(ics).toContain('DTSTART:20260601T080000Z\r\n');
		expect(ics).toContain('SUMMARY:Offerte verstuurd — Jansen\r\n');
	});

	it('emits an all-day VEVENT with VALUE=DATE', () => {
		const event: ICalEvent = {
			uid: 'opp-1:deadline@offertum',
			summary: 'Deadline klant — Jansen',
			at: new Date('2026-06-15T00:00:00.000Z'),
			allDay: true
		};
		const ics = serializeICalendar({
			prodId: PROD_ID,
			dtstamp: new Date('2026-06-02T00:00:00.000Z'),
			events: [event]
		});
		expect(ics).toContain('DTSTART;VALUE=DATE:20260615\r\n');
	});

	it('escapes commas, semicolons, and backslashes in SUMMARY', () => {
		const event: ICalEvent = {
			uid: 'x@offertum',
			summary: 'A, B; C \\ D',
			at: new Date('2026-06-01T08:00:00.000Z'),
			allDay: false
		};
		const ics = serializeICalendar({
			prodId: PROD_ID,
			dtstamp: new Date('2026-06-02T00:00:00.000Z'),
			events: [event]
		});
		expect(ics).toContain('SUMMARY:A\\, B\\; C \\\\ D\r\n');
	});

	it('folds lines longer than 75 octets', () => {
		const longName = 'X'.repeat(200);
		const event: ICalEvent = {
			uid: 'x@offertum',
			summary: longName,
			at: new Date('2026-06-01T08:00:00.000Z'),
			allDay: false
		};
		const ics = serializeICalendar({
			prodId: PROD_ID,
			dtstamp: new Date('2026-06-02T00:00:00.000Z'),
			events: [event]
		});
		// No physical line exceeds 75 octets...
		for (const line of ics.split('\r\n')) {
			expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
		}
		// ...but unfolding restores the full summary.
		expect(unfold(ics)).toContain(`SUMMARY:${longName}`);
	});
});

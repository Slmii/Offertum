import { endOfDayInTimeZone, yearInTimeZone } from '@/lib/time/timezone';
import { describe, expect, it } from '@jest/globals';

/**
 * Exercises the DST + year-boundary edges these helpers exist for — a plain UTC
 * calculation would silently give the wrong "Geldig tot" / quote-number year on
 * exactly these dates.
 */

describe('yearInTimeZone', () => {
	it('returns the local year even when UTC is still the previous day/year', () => {
		// 2025-12-31 23:30 UTC is 2026-01-01 00:30 in Amsterdam (CET, UTC+1).
		const date = new Date('2025-12-31T23:30:00.000Z');
		expect(yearInTimeZone(date, 'Europe/Amsterdam')).toBe(2026);
		expect(date.getUTCFullYear()).toBe(2025);
	});

	it('agrees with UTC for a date safely inside the calendar year', () => {
		const date = new Date('2026-06-15T12:00:00.000Z');
		expect(yearInTimeZone(date, 'Europe/Amsterdam')).toBe(2026);
	});
});

describe('endOfDayInTimeZone', () => {
	it('snaps to 22:59:59.999 UTC during Amsterdam summer time (CEST, UTC+2)', () => {
		// 2026-07-18 is CEST — local midnight-to-midnight is 22:00 UTC the prior day to 21:59:59.999 UTC.
		const date = new Date('2026-07-18T09:00:00.000Z');
		const end = endOfDayInTimeZone(date, 'Europe/Amsterdam');
		expect(end.toISOString()).toBe('2026-07-18T21:59:59.999Z');
	});

	it('snaps to 22:59:59.999 UTC during Amsterdam winter time (CET, UTC+1)', () => {
		const date = new Date('2026-01-10T09:00:00.000Z');
		const end = endOfDayInTimeZone(date, 'Europe/Amsterdam');
		expect(end.toISOString()).toBe('2026-01-10T22:59:59.999Z');
	});

	it('keeps a same-day-in-Amsterdam instant on the correct local calendar day', () => {
		// 2026-01-01 00:30 UTC is still 2026-01-01 01:30 in Amsterdam — same local day.
		const date = new Date('2026-01-01T00:30:00.000Z');
		const end = endOfDayInTimeZone(date, 'Europe/Amsterdam');
		expect(end.toISOString()).toBe('2026-01-01T22:59:59.999Z');
	});
});

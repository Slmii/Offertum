import { describe, expect, it } from '@jest/globals';
import { daysUntilExpiry } from './expiry.repository';

// NOW = 2026-06-09T08:00:00Z = 2026-06-09 10:00 Europe/Amsterdam (CEST, UTC+2).
const NOW = new Date('2026-06-09T08:00:00.000Z');

describe('daysUntilExpiry diffs local calendar days in Europe/Amsterdam', () => {
	it('returns 1 when validUntil lands on tomorrow’s local calendar day', () => {
		// 2026-06-10T09:00:00Z = 11:00 Amsterdam on the 10th — one calendar day ahead of the 9th,
		// even though it's only 25h of elapsed time.
		const validUntil = new Date('2026-06-10T09:00:00.000Z');
		expect(daysUntilExpiry(validUntil, NOW)).toBe(1);
	});

	it('returns 0 when validUntil lands on the same local calendar day as now', () => {
		// End-of-day snap: 2026-06-09T21:59:59.999Z = 23:59:59.999 Amsterdam on the 9th — the same
		// calendar day as NOW, so 0 days left (matches the web's toDaysUntil for the same instant).
		const validUntil = new Date('2026-06-09T21:59:59.999Z');
		expect(daysUntilExpiry(validUntil, NOW)).toBe(0);
	});

	it('returns 1 when validUntil is only 1h of elapsed time into tomorrow’s local calendar day', () => {
		// 2026-06-09T22:30:00Z = 00:30 Amsterdam on the 10th — rolled onto the next calendar day.
		const validUntil = new Date('2026-06-09T22:30:00.000Z');
		expect(daysUntilExpiry(validUntil, NOW)).toBe(1);
	});

	it('returns a negative count when validUntil’s local calendar day is already in the past', () => {
		// 2026-06-08T21:59:59.999Z = 23:59:59.999 Amsterdam on the 8th — a full calendar day before NOW.
		const yesterday = new Date('2026-06-08T21:59:59.999Z');
		expect(daysUntilExpiry(yesterday, NOW)).toBe(-1);
	});

	it('agrees across a DST boundary (CEST → CET) the same way the web’s toDaysUntil does', () => {
		// now: 2026-10-24T08:00:00Z = 10:00 Amsterdam (still CEST, UTC+2) — the day before the
		// clocks fall back. validUntil: 2026-10-26T21:59:59.999Z = 23:59:59.999 Amsterdam on the
		// 26th, now CET (UTC+1). Two local calendar days later despite the DST shift.
		const now = new Date('2026-10-24T08:00:00.000Z');
		const validUntil = new Date('2026-10-26T21:59:59.999Z');
		expect(daysUntilExpiry(validUntil, now)).toBe(2);
	});
});

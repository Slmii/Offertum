import { describe, expect, it } from '@jest/globals';
import { daysUntilExpiry } from './expiry.repository';

const NOW = new Date('2026-06-09T08:00:00.000Z');

describe('daysUntilExpiry rounds partial days up', () => {
	it('returns 2 when validUntil is 25h out', () => {
		const validUntil = new Date(NOW.getTime() + 25 * 60 * 60 * 1000);
		expect(daysUntilExpiry(validUntil, NOW)).toBe(2);
	});

	it('returns 1 when validUntil is exactly 24h out', () => {
		const validUntil = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
		expect(daysUntilExpiry(validUntil, NOW)).toBe(1);
	});

	it('returns 1 when validUntil is only 1h out (partial day rounds up)', () => {
		const validUntil = new Date(NOW.getTime() + 1 * 60 * 60 * 1000);
		expect(daysUntilExpiry(validUntil, NOW)).toBe(1);
	});

	it('returns 0 or negative when validUntil is already in the past', () => {
		// The implementation uses Math.ceil without a floor-at-0 guard, so a past date
		// returns a non-positive value. 2h in the past → Math.ceil(-2/24) = -0 (=== 0 in JS).
		// A full day in the past → Math.ceil(-1.0) = -1.
		const twoHoursAgo = new Date(NOW.getTime() - 2 * 60 * 60 * 1000);
		expect(daysUntilExpiry(twoHoursAgo, NOW)).toBeLessThanOrEqual(0);

		const fullDayAgo = new Date(NOW.getTime() - 25 * 60 * 60 * 1000);
		expect(daysUntilExpiry(fullDayAgo, NOW)).toBe(-1);
	});
});

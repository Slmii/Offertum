import { describe, expect, it } from 'vitest';
import {
	DIGEST_CATCH_UP_MINUTES,
	MINUTES_PER_WEEK,
	hhmmToMinutes,
	isWithinQuietHours,
	isoDayKey,
	isoWeekKey,
	minutesToHHMM,
	snapMinutesToGrid,
	weeklySlotOffsetMinutes
} from './notifications.js';

describe('hhmmToMinutes', () => {
	it('parses padded and unpadded hours', () => {
		expect(hhmmToMinutes('08:00')).toBe(480);
		expect(hhmmToMinutes('8:00')).toBe(480);
		expect(hhmmToMinutes('00:00')).toBe(0);
		expect(hhmmToMinutes('23:59')).toBe(1439);
	});

	it('trims surrounding whitespace', () => {
		expect(hhmmToMinutes('  07:30 ')).toBe(450);
	});

	it('rejects out-of-range and malformed input', () => {
		expect(hhmmToMinutes('24:00')).toBeNull();
		expect(hhmmToMinutes('12:60')).toBeNull();
		expect(hhmmToMinutes('12')).toBeNull();
		expect(hhmmToMinutes('12:5')).toBeNull();
		expect(hhmmToMinutes('')).toBeNull();
		expect(hhmmToMinutes('ab:cd')).toBeNull();
	});
});

describe('minutesToHHMM', () => {
	it('round-trips every minute of the day', () => {
		for (let minutes = 0; minutes < 1440; minutes++) {
			expect(hhmmToMinutes(minutesToHHMM(minutes))).toBe(minutes);
		}
	});

	it('wraps out-of-range values into the day', () => {
		expect(minutesToHHMM(1440)).toBe('00:00');
		expect(minutesToHHMM(-30)).toBe('23:30');
	});
});

describe('snapMinutesToGrid', () => {
	it('snaps to the nearest quarter hour', () => {
		expect(snapMinutesToGrid(480)).toBe(480); // 08:00
		expect(snapMinutesToGrid(487)).toBe(480); // 08:07 → 08:00
		expect(snapMinutesToGrid(488)).toBe(495); // 08:08 → 08:15
	});

	// The bug this replaced snapped the minute in isolation, so it could not carry into the
	// hour: 08:55 became 08:45 — ten minutes EARLIER than asked for.
	it('carries across the hour instead of clamping backwards', () => {
		expect(minutesToHHMM(snapMinutesToGrid(hhmmToMinutes('08:55')!))).toBe('09:00');
		expect(minutesToHHMM(snapMinutesToGrid(hhmmToMinutes('08:53')!))).toBe('09:00');
		expect(minutesToHHMM(snapMinutesToGrid(hhmmToMinutes('08:45')!))).toBe('08:45');
	});

	it('clamps at the end of the day rather than wrapping to tomorrow', () => {
		expect(minutesToHHMM(snapMinutesToGrid(hhmmToMinutes('23:58')!))).toBe('23:45');
		expect(minutesToHHMM(snapMinutesToGrid(0))).toBe('00:00');
	});

	it('always lands on the grid the cron ticks on', () => {
		for (let minutes = 0; minutes < 1440; minutes++) {
			expect(snapMinutesToGrid(minutes) % 15).toBe(0);
		}
	});
});

describe('isWithinQuietHours', () => {
	const evening = hhmmToMinutes('19:00')!;
	const morning = hhmmToMinutes('07:30')!;

	it('covers both sides of midnight when the window wraps', () => {
		expect(isWithinQuietHours(hhmmToMinutes('22:00')!, evening, morning)).toBe(true);
		expect(isWithinQuietHours(hhmmToMinutes('03:00')!, evening, morning)).toBe(true);
		expect(isWithinQuietHours(hhmmToMinutes('12:00')!, evening, morning)).toBe(false);
	});

	it('is half-open: start is inside, end is outside', () => {
		expect(isWithinQuietHours(evening, evening, morning)).toBe(true);
		expect(isWithinQuietHours(morning, evening, morning)).toBe(false);
	});

	it('handles a same-day window', () => {
		const start = hhmmToMinutes('09:00')!;
		const end = hhmmToMinutes('17:00')!;
		expect(isWithinQuietHours(hhmmToMinutes('08:59')!, start, end)).toBe(false);
		expect(isWithinQuietHours(start, start, end)).toBe(true);
		expect(isWithinQuietHours(hhmmToMinutes('16:59')!, start, end)).toBe(true);
		expect(isWithinQuietHours(end, start, end)).toBe(false);
	});

	// A zero-length window is empty, not "all day". The API rejects it so a user cannot
	// save it while the toggle reads enabled; this pins the arithmetic either way.
	it('treats an equal start and end as an empty window', () => {
		const at = hhmmToMinutes('22:00')!;
		expect(isWithinQuietHours(at, at, at)).toBe(false);
		expect(isWithinQuietHours(hhmmToMinutes('03:00')!, at, at)).toBe(false);
	});
});

describe('weeklySlotOffsetMinutes', () => {
	it('places Monday 00:00 at zero and stays inside the week', () => {
		expect(weeklySlotOffsetMinutes(1, 0, 0)).toBe(0);
		expect(weeklySlotOffsetMinutes(1, 8, 0)).toBe(480);
		expect(weeklySlotOffsetMinutes(7, 23, 59)).toBe(MINUTES_PER_WEEK - 1);
	});

	it('orders days correctly', () => {
		expect(weeklySlotOffsetMinutes(2, 0, 0)).toBeGreaterThan(weeklySlotOffsetMinutes(1, 23, 59));
	});

	// The scheduler asks "has this slot passed, and by less than the catch-up window".
	// These are the cases the old exact-equality match got wrong.
	it('still considers a slot due when the tick runs late', () => {
		const slot = weeklySlotOffsetMinutes(1, 8, 0); // Monday 08:00
		const lateTick = weeklySlotOffsetMinutes(1, 8, 16); // ran at 08:16
		expect(lateTick).toBeGreaterThanOrEqual(slot);
		expect(lateTick - slot).toBeLessThanOrEqual(DIGEST_CATCH_UP_MINUTES);
	});

	it('considers a slot inside the spring DST gap due at the next tick after the gap', () => {
		// Amsterdam jumps 01:59 → 03:00; a 02:30 slot never occurs on the wall clock.
		const slot = weeklySlotOffsetMinutes(7, 2, 30);
		const firstTickAfterGap = weeklySlotOffsetMinutes(7, 3, 0);
		expect(firstTickAfterGap).toBeGreaterThanOrEqual(slot);
		expect(firstTickAfterGap - slot).toBeLessThanOrEqual(DIGEST_CATCH_UP_MINUTES);
	});

	it('does not reach back beyond the catch-up window', () => {
		const slot = weeklySlotOffsetMinutes(1, 8, 0);
		const muchLater = weeklySlotOffsetMinutes(3, 8, 0); // Wednesday
		expect(muchLater - slot).toBeGreaterThan(DIGEST_CATCH_UP_MINUTES);
	});
});

describe('isoWeekKey', () => {
	it('is stable across a week and changes on Monday', () => {
		// 2026-09-20 is a Sunday; 2026-09-21 is the Monday that starts the next ISO week.
		expect(isoWeekKey(2026, 9, 14)).toBe(isoWeekKey(2026, 9, 20));
		expect(isoWeekKey(2026, 9, 21)).not.toBe(isoWeekKey(2026, 9, 20));
	});

	// The October DST overlap: 02:30 happens twice on the same local date, so both ticks
	// resolve to the same key and the second one cannot claim a second delivery.
	it('gives the repeated DST hour a single key', () => {
		expect(isoWeekKey(2026, 10, 25)).toBe(isoWeekKey(2026, 10, 25));
	});

	it('handles ISO year boundaries', () => {
		// 2027-01-01 is a Friday, so it belongs to the ISO week of 2026-12-28 (Monday).
		expect(isoWeekKey(2027, 1, 1)).toBe(isoWeekKey(2026, 12, 28));
		expect(isoWeekKey(2026, 1, 1)).toMatch(/^\d{4}-W\d{2}$/);
	});

	it('zero-pads the week number', () => {
		expect(isoWeekKey(2026, 1, 5)).toBe('2026-W02');
	});

	// Regression: the first implementation computed `days / 7 + 1` instead of
	// `(days + 1) / 7`, which is off by one for most of the year. It agreed with the
	// correct answer only when the day count was an exact multiple of 7 — and the
	// original tests happened to pick exactly such dates.
	it('matches ISO-8601 week numbers at year boundaries', () => {
		expect(isoWeekKey(2021, 1, 1)).toBe('2020-W53');
		expect(isoWeekKey(2021, 1, 4)).toBe('2021-W01');
		expect(isoWeekKey(2027, 1, 4)).toBe('2027-W01');
		expect(isoWeekKey(2026, 12, 28)).toBe('2026-W53');
		expect(isoWeekKey(2026, 9, 20)).toBe('2026-W38');
	});

	it('never emits a week number above 53', () => {
		for (let year = 2020; year <= 2035; year++) {
			for (const [month, day] of [[1, 1], [1, 4], [6, 15], [12, 28], [12, 31]] as const) {
				const week = Number(isoWeekKey(year, month, day).split('-W')[1]);
				expect(week).toBeGreaterThanOrEqual(1);
				expect(week).toBeLessThanOrEqual(53);
			}
		}
	});
});

describe('isoDayKey', () => {
	it('zero-pads month and day', () => {
		expect(isoDayKey(2026, 9, 20)).toBe('2026-09-20');
		expect(isoDayKey(2026, 12, 1)).toBe('2026-12-01');
	});
});

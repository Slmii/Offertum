import { describe, expect, it } from 'vitest';
import { toReadableDate, toReadableDateTime } from './date.utils';

// These assert the rendered string for FIXED UTC instants. They must produce the same
// output regardless of the machine's local timezone (the prod server runs UTC, the
// visitor's browser runs Europe/Amsterdam) — that's the whole hydration-safety contract.
describe('date.utils — timezone-pinned formatting', () => {
	it('renders a UTC instant in Amsterdam local time (CEST, UTC+2)', () => {
		// 2026-06-17T12:32:00Z = 14:32 in Amsterdam during summer time.
		expect(toReadableDateTime('2026-06-17T12:32:00.000Z')).toBe('17 jun 2026 14:32');
	});

	it('renders a UTC instant in Amsterdam local time (CET, UTC+1)', () => {
		// 2026-01-15T13:32:00Z = 14:32 in Amsterdam during winter time.
		expect(toReadableDateTime('2026-01-15T13:32:00.000Z')).toBe('15 jan 2026 14:32');
	});

	it('rolls a late-evening UTC instant over to the next Amsterdam calendar day', () => {
		// 23:30 UTC on the 15th is already 00:30 on the 16th in Amsterdam (CET).
		expect(toReadableDate('2026-01-15T23:30:00.000Z')).toBe('16 jan');
	});

	it('keeps a mid-day instant on the same calendar day', () => {
		expect(toReadableDate('2026-05-17T10:00:00.000Z')).toBe('17 mei');
	});
});

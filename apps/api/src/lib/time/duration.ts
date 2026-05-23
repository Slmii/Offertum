/**
 * Time-unit helpers. Replaces inline `24 * 60 * 60 * 1000` chains everywhere — those
 * are read-write hostile (you have to count the multiplications) AND error-prone
 * (one stray digit silently shifts windows by an order of magnitude).
 *
 * Pattern: keep the math constants for places that need to compose units
 * (`msToDays`, custom math) and the helper functions for the common
 * "N <unit> as milliseconds" case (`daysToMs(14)` reads as English).
 *
 * Reverse helpers (`msToDays`, etc.) round to the nearest integer; if you need
 * sub-day precision do the division yourself with `MS_PER_DAY`.
 */

export const MS_PER_SECOND = 1000;
export const MS_PER_MINUTE = 60 * MS_PER_SECOND;
export const MS_PER_HOUR = 60 * MS_PER_MINUTE;
export const MS_PER_DAY = 24 * MS_PER_HOUR;
export const MS_PER_WEEK = 7 * MS_PER_DAY;

export function secondsToMs(seconds: number): number {
	return seconds * MS_PER_SECOND;
}

export function minutesToMs(minutes: number): number {
	return minutes * MS_PER_MINUTE;
}

export function hoursToMs(hours: number): number {
	return hours * MS_PER_HOUR;
}

export function daysToMs(days: number): number {
	return days * MS_PER_DAY;
}

export function weeksToMs(weeks: number): number {
	return weeks * MS_PER_WEEK;
}

/** Round-to-nearest day count from a millisecond duration. */
export function msToDays(ms: number): number {
	return Math.round(ms / MS_PER_DAY);
}

/** Round-to-nearest hour count from a millisecond duration. */
export function msToHours(ms: number): number {
	return Math.round(ms / MS_PER_HOUR);
}

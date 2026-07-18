import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Timezone-aware calendar math, backed by dayjs (same library + `utc`/`timezone` plugins the web
 * uses, so FE and BE agree). Used where a calendar boundary — a local day or local year — must be
 * computed in a specific org's timezone rather than in UTC. Elapsed-duration math ("N days since X")
 * is already timezone-insensitive and needs none of this.
 */

/** The calendar year of `date` as seen in `timeZone` (e.g. 2026-01-01 00:30 Amsterdam → 2026). */
export function yearInTimeZone(date: Date, timeZone: string): number {
	return dayjs(date).tz(timeZone).year();
}

/**
 * The instant of the last millisecond (23:59:59.999) of the local calendar day that contains `date`
 * in `timeZone`. Used to snap a quote's `validUntil` to end-of-local-day so "Geldig tot" covers the
 * whole day and the server/client expiry checks agree.
 */
export function endOfDayInTimeZone(date: Date, timeZone: string): Date {
	return dayjs(date).tz(timeZone).endOf('day').toDate();
}

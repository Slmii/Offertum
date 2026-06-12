import { BUSINESS_TIME_ZONE } from '@offertum/shared';
import dayjs from 'dayjs';
import 'dayjs/locale/nl';
import relativeTime from 'dayjs/plugin/relativeTime';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

dayjs.extend(relativeTime);
dayjs.extend(utc);
dayjs.extend(timezone);

// Locale AND timezone are pinned: the prod server renders in UTC while the visitor's
// browser sits in Europe/Amsterdam — without `.tz(...)` every timestamp hydrates to a
// different string than the server sent (and date-only values can shift a whole day
// around midnight).

/**
 * Date-only format, NL locale, business time zone. Default `D MMM` ("17 mei"). Use for
 * customer deadlines, inspection dates, anything where the time-of-day isn't meaningful.
 */
export const toReadableDate = (date: Date | string, format: string = 'D MMM') => {
	return dayjs(date).tz(BUSINESS_TIME_ZONE).locale('nl').format(format);
};

/**
 * Date + time, NL locale, business time zone ("17 mei 2026 14:32"). Use for activity
 * logs, audit timestamps, and anywhere "when exactly did this happen" matters.
 */
export const toReadableDateTime = (date: Date | string) => {
	return dayjs(date).tz(BUSINESS_TIME_ZONE).locale('nl').format('D MMM YYYY HH:mm');
};

/**
 * Human-relative ("2u geleden", "gisteren"). Use for inbox arrival times — the user
 * cares more about "how recent" than the absolute timestamp. Instant-difference based,
 * so timezone pinning isn't needed here.
 */
export const toReadableTimestamp = (date: Date | string) => {
	return dayjs(date).locale('nl').fromNow();
};

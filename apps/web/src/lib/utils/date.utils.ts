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
 * Compact human-relative time ("zojuist", "8m geleden", "2u geleden", "2d geleden",
 * "1w geleden", "3mnd geleden", "2j geleden"). Abbreviated units instead of dayjs'
 * verbose `fromNow()` ("8 minuten geleden"). Instant-difference based, so timezone
 * pinning isn't needed here. Future timestamps render as "over <x>".
 */
export const toReadableTimestamp = (date: Date | string) => {
	const seconds = dayjs().diff(dayjs(date), 'second');
	const past = seconds >= 0;
	const abs = Math.abs(seconds);

	if (abs < 60) {
		return 'zojuist';
	}

	const MINUTE = 60;
	const HOUR = 60 * MINUTE;
	const DAY = 24 * HOUR;
	const WEEK = 7 * DAY;
	const MONTH = 30 * DAY;
	const YEAR = 365 * DAY;

	let core: string;
	if (abs < HOUR) {
		core = `${Math.floor(abs / MINUTE)}m`;
	} else if (abs < DAY) {
		core = `${Math.floor(abs / HOUR)}u`;
	} else if (abs < WEEK) {
		core = `${Math.floor(abs / DAY)}d`;
	} else if (abs < MONTH) {
		core = `${Math.floor(abs / WEEK)}w`;
	} else if (abs < YEAR) {
		core = `${Math.floor(abs / MONTH)}mnd`;
	} else {
		core = `${Math.floor(abs / YEAR)}j`;
	}

	return past ? `${core} geleden` : `over ${core}`;
};

import dayjs from 'dayjs';
import 'dayjs/locale/nl';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

/**
 * Date-only format, NL locale. Default `D MMM` ("17 mei"). Use for customer deadlines,
 * inspection dates, anything where the time-of-day isn't meaningful.
 */
export const toReadableDate = (date: Date | string, format: string = 'D MMM') => {
	return dayjs(date).locale('nl').format(format);
};

/**
 * Date + time, NL locale ("17 mei 2026 14:32"). Use for activity logs, audit
 * timestamps, and anywhere "when exactly did this happen" matters.
 */
export const toReadableDateTime = (date: Date | string) => {
	return dayjs(date).locale('nl').format('D MMM YYYY HH:mm');
};

/**
 * Human-relative ("2u geleden", "gisteren"). Use for inbox arrival times — the user
 * cares more about "how recent" than the absolute timestamp.
 */
export const toReadableTimestamp = (date: Date | string) => {
	return dayjs(date).locale('nl').fromNow();
};

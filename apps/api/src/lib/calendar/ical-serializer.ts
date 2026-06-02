// apps/api/src/lib/calendar/ical-serializer.ts

export interface ICalEvent {
	uid: string;
	summary: string;
	at: Date;
	allDay: boolean;
}

export interface ICalendarInput {
	prodId: string;
	dtstamp: Date;
	events: ICalEvent[];
}

const CRLF = '\r\n';

/** Escape per RFC 5545 §3.3.11: backslash, semicolon, comma, and newline in TEXT values. */
function escapeText(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

/** `YYYYMMDDTHHMMSSZ` (UTC) for timed values. */
function formatUtc(date: Date): string {
	return date
		.toISOString()
		.replace(/[-:]/g, '')
		.replace(/\.\d{3}Z$/, 'Z');
}

/** `YYYYMMDD` in Europe/Amsterdam (the business time zone) for all-day values. */
function formatDate(date: Date): string {
	// en-CA formats as YYYY-MM-DD; the Amsterdam time zone is the owner's local calendar day.
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Europe/Amsterdam',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(date);
	return parts.replace(/-/g, '');
}

/**
 * Fold a content line to ≤75 octets per RFC 5545 §3.1: split on UTF-8 byte boundaries,
 * continuation lines begin with a single space. Folds on bytes, not chars, so multi-byte
 * runes never get split mid-sequence.
 */
function foldLine(line: string): string {
	const bytes = Buffer.from(line, 'utf8');
	if (bytes.length <= 75) {
		return line;
	}
	const chunks: string[] = [];
	let start = 0;
	let limit = 75; // first line: 75 octets; continuations: 1 space + 74 octets
	while (start < bytes.length) {
		let end = Math.min(start + limit, bytes.length);
		// Back off so we don't split a multi-byte UTF-8 sequence (continuation bytes = 10xxxxxx).
		while (end < bytes.length) {
			const byte = bytes[end];
			if (byte === undefined || (byte & 0xc0) !== 0x80) {
				break;
			}
			end -= 1;
		}
		chunks.push(bytes.subarray(start, end).toString('utf8'));
		start = end;
		limit = 74;
	}
	return chunks.join(`${CRLF} `);
}

function serializeEvent(event: ICalEvent, dtstamp: Date): string[] {
	const dtstart = event.allDay ? `DTSTART;VALUE=DATE:${formatDate(event.at)}` : `DTSTART:${formatUtc(event.at)}`;
	return [
		'BEGIN:VEVENT',
		foldLine(`UID:${event.uid}`),
		`DTSTAMP:${formatUtc(dtstamp)}`,
		foldLine(dtstart),
		foldLine(`SUMMARY:${escapeText(event.summary)}`),
		'END:VEVENT'
	];
}

/** Build a complete RFC 5545 VCALENDAR string (CRLF-terminated, folded, escaped). */
export function serializeICalendar(input: ICalendarInput): string {
	const lines = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		foldLine(`PRODID:${input.prodId}`),
		'CALSCALE:GREGORIAN',
		'METHOD:PUBLISH',
		...input.events.flatMap(event => serializeEvent(event, input.dtstamp)),
		'END:VCALENDAR'
	];
	return lines.join(CRLF) + CRLF;
}

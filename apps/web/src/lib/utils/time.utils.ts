// Time-of-day (HH:MM) input helpers, shared by the notification cadence time fields.

// Only rewrite a part when it exceeds its max (keeps what the user typed otherwise — single
// digits, leading zeros — so "5", "05" and "5:55" are all preserved).
function clampTimePart(part: string, max: number): string {
	return part.length > 0 && Number(part) > max ? String(max) : part;
}

/**
 * Live-mask a time input toward a valid H:MM / HH:MM. Accepts a typed colon as the separator;
 * with no colon, auto-inserts one after two digits (so "0730" → "07:30"). Hours clamp to 23,
 * minutes to 59. Partial values are allowed while typing (e.g. "5", "18:", "07:3").
 */
export function formatTimeInput(raw: string): string {
	// Keep digits + the first colon only.
	let cleaned = '';
	let hasColon = false;
	for (const ch of raw) {
		if (ch >= '0' && ch <= '9') {
			cleaned += ch;
		} else if (ch === ':' && !hasColon) {
			cleaned += ':';
			hasColon = true;
		}
	}

	const colonIndex = cleaned.indexOf(':');

	// No colon typed yet: ≤2 digits stay hour-only; a 3rd/4th digit splits into H:MM.
	if (colonIndex === -1) {
		if (cleaned.length <= 2) {
			return clampTimePart(cleaned, 23);
		}
		return `${clampTimePart(cleaned.slice(0, 2), 23)}:${clampTimePart(cleaned.slice(2, 4), 59)}`;
	}

	const hour = clampTimePart(cleaned.slice(0, colonIndex).slice(0, 2), 23);
	const minute = clampTimePart(cleaned.slice(colonIndex + 1).slice(0, 2), 59);
	return `${hour}:${minute}`;
}

/**
 * Pad a partially-typed time to a full HH:MM on blur. The hour pads on the left (5 → 05); the
 * minute is read left-to-right so a lone digit is the tens place (2 → 20, matching 5:2 → 05:20).
 * An empty field is left empty.
 */
export function normalizeTime(value: string): string {
	if (!value.trim()) {
		return value;
	}
	const [rawHour = '', rawMinute = ''] = value.split(':');
	const hourDigits = rawHour.replace(/\D/g, '').slice(0, 2);
	const minuteDigits = rawMinute.replace(/\D/g, '').slice(0, 2);
	const hour = String(Math.min(23, Number(hourDigits || '0'))).padStart(2, '0');
	const minute = String(Math.min(59, Number((minuteDigits || '0').padEnd(2, '0')))).padStart(2, '0');
	return `${hour}:${minute}`;
}

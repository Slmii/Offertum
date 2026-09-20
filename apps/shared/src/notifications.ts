export const NOTIFICATION_EVENT_TYPES = [
	'opportunity_created',
	'customer_reply',
	'opportunity_auto_cold',
	'weekly_digest',
	'daily_digest',
	'mailbox_issue'
] as const;
export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

export const NOTIFICATION_CHANNELS = ['in_app', 'email'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export interface AppNotification {
	id: string;
	organizationId: string;
	eventType: NotificationEventType;
	title: string;
	body: string;
	link: string | null;
	createdAt: string;
	readAt: string | null;
}

export interface NotificationListResponse {
	notifications: AppNotification[];
	unreadCount: number;
}

export interface NotificationPreference {
	eventType: NotificationEventType;
	channel: NotificationChannel;
	enabled: boolean;
}

export interface NotificationPreferencesResponse {
	preferences: NotificationPreference[];
}

export interface UpdateNotificationPreferencesInput {
	preferences: NotificationPreference[];
}

export const NOTIFICATION_LIST_LIMIT = 25;

// Critical events are system-driven and always delivered on both channels — they are NOT
// user-configurable (no preference row, no toggle) and they break through quiet hours.
// `mailbox_issue` (a connected inbox lost access) is the sole one today: if the owner can't
// be told their mailbox stopped working, every other notification silently stops mattering.
export const CRITICAL_EVENT_TYPES: ReadonlyArray<NotificationEventType> = ['mailbox_issue'];

export function isCriticalEvent(eventType: NotificationEventType): boolean {
	return CRITICAL_EVENT_TYPES.includes(eventType);
}

// The user-configurable subset — everything the settings matrix renders toggles for. Critical
// events are excluded (always on). Both the API's default-fill and the web settings page iterate
// this list, never the full `NOTIFICATION_EVENT_TYPES`.
export const PREFERENCE_EVENT_TYPES: ReadonlyArray<NotificationEventType> = NOTIFICATION_EVENT_TYPES.filter(
	event => !isCriticalEvent(event)
);

// Events for which the email channel is exposed at all. Per-message emails
// (`opportunity_created`, `customer_reply`) are opt-outable but on by default —
// Offertum's triage is the signal a raw inbox can't give (this one is a real lead
// worth acting on), and for shared/team mailboxes it routes the lead to the assignee
// who may not be watching that inbox. The digests + auto-cold carry info the inbox
// can't derive (aggregate state, system-driven status change). `mailbox_issue` is
// critical, so it's email-capable too.
// The settings UI only renders email toggles for events in this set; the service
// refuses email dispatch for anything outside it.
export const EMAIL_CHANNEL_ALLOWED_EVENTS: ReadonlyArray<NotificationEventType> = [
	'opportunity_created',
	'customer_reply',
	'opportunity_auto_cold',
	'weekly_digest',
	'daily_digest',
	'mailbox_issue'
];

export function isEmailChannelAvailable(eventType: NotificationEventType): boolean {
	return EMAIL_CHANNEL_ALLOWED_EVENTS.includes(eventType);
}

// Default policy when no NotificationPreference row exists for a (user, event, channel).
// Critical events default ON on every channel (and can't be turned off). Otherwise: email
// defaults ON for every event where it's available (see EMAIL_CHANNEL_ALLOWED_EVENTS);
// in-app defaults OFF (opt-in).
export function defaultNotificationPreference(eventType: NotificationEventType, channel: NotificationChannel): boolean {
	if (isCriticalEvent(eventType)) {
		return true;
	}
	if (channel === 'email') {
		return isEmailChannelAvailable(eventType);
	}
	return false;
}

// ── Per-user notification settings (cadence + quiet hours) ───────────────────
// Distinct from the per-event preference matrix: these are scalar, person-scoped
// controls surfaced in the "Cadans" card. Times are wire-encoded as "HH:MM" (24h)
// and the day as a lowercase English weekday; the API converts to storage integers.

export const WEEKLY_DIGEST_DAYS = [
	'monday',
	'tuesday',
	'wednesday',
	'thursday',
	'friday',
	'saturday',
	'sunday'
] as const;
export type WeeklyDigestDay = (typeof WEEKLY_DIGEST_DAYS)[number];

// ISO-8601 weekday numbers (Monday = 1 … Sunday = 7) — the storage + scheduling form.
export const WEEKLY_DIGEST_DAY_TO_ISO: Record<WeeklyDigestDay, number> = {
	monday: 1,
	tuesday: 2,
	wednesday: 3,
	thursday: 4,
	friday: 5,
	saturday: 6,
	sunday: 7
};

export const WEEKLY_DIGEST_ISO_TO_DAY: Record<number, WeeklyDigestDay> = {
	1: 'monday',
	2: 'tuesday',
	3: 'wednesday',
	4: 'thursday',
	5: 'friday',
	6: 'saturday',
	7: 'sunday'
};

export interface NotificationSettings {
	weeklyDigestDay: WeeklyDigestDay;
	weeklyDigestTime: string; // "HH:MM"
	quietHoursStart: string; // "HH:MM"
	quietHoursEnd: string; // "HH:MM"
	quietHoursEnabled: boolean;
}

export interface NotificationSettingsResponse {
	settings: NotificationSettings;
}

export type UpdateNotificationSettingsInput = NotificationSettings;

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
	weeklyDigestDay: 'monday',
	weeklyDigestTime: '08:00',
	quietHoursStart: '19:00',
	quietHoursEnd: '07:30',
	quietHoursEnabled: false
};

// "HH:MM" ⇆ minutes-from-midnight [0,1439]. Returns null for malformed input so callers can
// reject it. Accepts single-digit hours ("8:00") for tolerance.
export function hhmmToMinutes(value: string): number | null {
	const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
	if (!match) {
		return null;
	}
	const hours = Number(match[1]);
	const minutes = Number(match[2]);
	if (hours > 23 || minutes > 59) {
		return null;
	}
	return hours * 60 + minutes;
}

export function minutesToHHMM(total: number): string {
	const clamped = ((Math.trunc(total) % 1440) + 1440) % 1440;
	const hours = Math.floor(clamped / 60);
	const minutes = clamped % 60;
	return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

// Is `nowMinutes` inside the quiet window? The window wraps midnight when start > end
// (e.g. 19:00 → 07:30 covers the evening AND the early morning). Half-open [start, end).
export function isWithinQuietHours(nowMinutes: number, startMinutes: number, endMinutes: number): boolean {
	if (startMinutes === endMinutes) {
		return false;
	}
	if (startMinutes < endMinutes) {
		return nowMinutes >= startMinutes && nowMinutes < endMinutes;
	}
	return nowMinutes >= startMinutes || nowMinutes < endMinutes;
}

// ── Digest scheduling ────────────────────────────────────────────────────────
// The weekly digest runs on a 15-minute cron and asks, per user, "is your slot due
// this period and have you not been sent it yet?" — deliberately NOT "does your slot
// equal this exact tick". Exact equality had zero tolerance for clock skew, dropped a
// week whenever a tick ran late, sent twice during the repeated DST hour in October,
// and silently skipped the hour that does not exist in March. An inequality plus a
// per-period delivery claim (see the DigestDelivery table) handles all four.

export const DIGEST_SLOT_GRID_MINUTES = 15;
export const MINUTES_PER_DAY = 1440;
export const MINUTES_PER_WEEK = 10_080;

// How far back a tick will reach to deliver a slot it missed. Sized to absorb a DST
// shift (1h) plus a realistic scheduler outage, while staying short enough that a user
// created mid-week is not immediately blasted with a digest whose slot already passed.
export const DIGEST_CATCH_UP_MINUTES = 360;

// Round minutes-from-midnight to the nearest grid point, carrying across the hour.
// Clamps at 23:45 rather than wrapping to the next day — a user picking 23:58 wants
// "late tonight", not "midnight tomorrow".
export function snapMinutesToGrid(totalMinutes: number): number {
	const snapped = Math.round(totalMinutes / DIGEST_SLOT_GRID_MINUTES) * DIGEST_SLOT_GRID_MINUTES;
	return Math.min(Math.max(snapped, 0), MINUTES_PER_DAY - DIGEST_SLOT_GRID_MINUTES);
}

// Position of a (ISO weekday, hour, minute) slot within the week, Monday 00:00 = 0.
export function weeklySlotOffsetMinutes(isoDay: number, hour: number, minute: number): number {
	return (isoDay - 1) * MINUTES_PER_DAY + hour * 60 + minute;
}

// ISO-8601 week key ("2026-W38") for a calendar date. The caller passes the date as it
// reads on a wall clock in the target timezone; the arithmetic is done in UTC so no
// timezone offset can shift the week boundary. Weeks start Monday, matching the ISO
// weekday numbering used for slots, so a week key and a slot offset agree on when the
// week rolls over.
export function isoWeekKey(year: number, month: number, day: number): string {
	const date = new Date(Date.UTC(year, month - 1, day));
	const isoWeekday = date.getUTCDay() || 7;
	// Shift to the Thursday of this ISO week — the day that determines the ISO year.
	date.setUTCDate(date.getUTCDate() + 4 - isoWeekday);
	const isoYear = date.getUTCFullYear();
	// Day-of-year of that Thursday, divided into weeks. Note the grouping: the +1 belongs
	// INSIDE the division. Doing `days / 7 + 1` instead is off by one for most of the year
	// and only agrees with the correct formula when the day count is an exact multiple of 7.
	const yearStart = Date.UTC(isoYear, 0, 1);
	const dayOfYear = (date.getTime() - yearStart) / 86_400_000 + 1;
	const week = Math.ceil(dayOfYear / 7);
	return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

// Calendar-day key ("2026-09-20") for the daily digest's delivery claim.
export function isoDayKey(year: number, month: number, day: number): string {
	return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

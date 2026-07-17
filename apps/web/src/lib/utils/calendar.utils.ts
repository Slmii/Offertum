import { tokens, type AppTokens } from '@/lib/utils/theme.utils';
import type { CalendarEventType } from '@offertum/shared';

// Each event type maps to one of the design-system status ramps (the design's Calendar palette:
// follow_up→pending, customer-side dates→cold/won, expiry→lost). Resolving against a ramp keeps
// the calendar correct in both light and dark themes.
type StatusRamp = 'pending' | 'cold' | 'won' | 'lost';

const EVENT_RAMP: Record<CalendarEventType, StatusRamp> = {
	follow_up: 'pending',
	deadline: 'cold',
	appointment: 'won',
	expiry: 'lost'
};

const LABELS: Record<CalendarEventType, string> = {
	expiry: 'Offerte verloopt',
	appointment: 'Afspraak',
	deadline: 'Deadline klant',
	follow_up: 'Opvolging'
};

/** Tinted bg + ink + dot/edge accent for one event type, resolved against the active theme. */
export interface CalendarEventStyle {
	bg: string;
	fg: string;
	dot: string;
	edge: string;
}

export function calendarEventStyle(t: AppTokens, type: CalendarEventType): CalendarEventStyle {
	const ramp = t.color[EVENT_RAMP[type]];
	return { bg: ramp[50], fg: ramp[700], dot: ramp[500], edge: ramp[500] };
}

/** Single representative color (the ramp's 500) — used where one swatch is needed (e.g. legend/dot). */
export function calendarEventColor(type: CalendarEventType): string {
	return tokens.color[EVENT_RAMP[type]][500];
}

export function calendarEventLabel(type: CalendarEventType): string {
	return LABELS[type];
}

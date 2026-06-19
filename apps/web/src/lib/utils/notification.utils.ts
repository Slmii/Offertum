import type { AppIconName } from '@/components/AppIcon.component';
import type { tokens } from '@/lib/utils/theme.utils';
import type { NotificationEventType } from '@offertum/shared';

type Tokens = typeof tokens;

/**
 * Per-kind icon + color treatment for a notification row — ported from the design's
 * `NOTIF_KINDS` table. The design keys on a free-form `kind`; the backend models the
 * narrower {@link NotificationEventType} enum, so the mapping below collapses the two
 * digest kinds (daily/weekly) onto their event types and reuses the closest visual
 * treatment for the events the backend actually emits.
 *
 * Design kinds with no backend event yet (`checkin-ready`, `mailbox-issue`) are kept in
 * the comment trail for when those notification types land, but are not reachable today.
 */
export interface NotificationKindStyle {
	icon: AppIconName;
	// Resolve background + foreground from the live theme tokens so the treatment
	// inverts correctly in dark mode.
	bg: (t: Tokens) => string;
	fg: (t: Tokens) => string;
}

const NOTIFICATION_KIND_STYLES: Record<NotificationEventType, NotificationKindStyle> = {
	// digest-today / sunrise — solid accent, the most prominent treatment.
	daily_digest: {
		icon: 'sunrise',
		bg: t => t.color.accent[500],
		fg: t => t.color.accent.fg
	},
	// new-quote / inbox — soft accent tint.
	opportunity_created: {
		icon: 'inbox',
		bg: t => t.color.accent[50],
		fg: t => t.color.accent[700]
	},
	// customer-reply / corner-up-left — won (green) tint.
	customer_reply: {
		icon: 'corner-up-left',
		bg: t => t.color.won[50],
		fg: t => t.color.won[700]
	},
	// auto-cold / snowflake — neutral cool surface.
	opportunity_auto_cold: {
		icon: 'snowflake',
		bg: t => t.color.paper3,
		fg: t => t.color.ink3
	},
	// digest / file-text — neutral surface.
	weekly_digest: {
		icon: 'file-text',
		bg: t => t.color.paper3,
		fg: t => t.color.ink3
	}
};

// Fallback mirrors the design's `NOTIF_KINDS["digest"]` default for unknown event types.
const DEFAULT_KIND_STYLE: NotificationKindStyle = {
	icon: 'file-text',
	bg: t => t.color.paper3,
	fg: t => t.color.ink3
};

export function notificationKindStyle(eventType: NotificationEventType): NotificationKindStyle {
	return NOTIFICATION_KIND_STYLES[eventType] ?? DEFAULT_KIND_STYLE;
}

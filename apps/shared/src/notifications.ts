export const NOTIFICATION_EVENT_TYPES = [
	'opportunity_created',
	'customer_reply',
	'opportunity_auto_cold',
	'weekly_digest'
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

// Events for which the email channel is exposed at all. Per-event transactional
// emails (`opportunity_created`, `customer_reply`) were dropped because the customer's
// own email already lands in the user's inbox — a Quoteom-branded notification on top
// is pure noise. Weekly digest + auto-cold stay because they carry info the inbox
// can't derive (aggregate state for digest, system-driven status change for auto-cold).
// The settings UI only renders email toggles for events in this set; the service
// refuses email dispatch for anything outside it.
export const EMAIL_CHANNEL_ALLOWED_EVENTS: ReadonlyArray<NotificationEventType> = [
	'opportunity_auto_cold',
	'weekly_digest'
];

export function isEmailChannelAvailable(eventType: NotificationEventType): boolean {
	return EMAIL_CHANNEL_ALLOWED_EVENTS.includes(eventType);
}

// Default policy when no NotificationPreference row exists for a (user, event, channel).
// In-app defaults ON for every event. Email defaults ON only for events where it's
// available (see EMAIL_CHANNEL_ALLOWED_EVENTS).
export function defaultNotificationPreference(eventType: NotificationEventType, channel: NotificationChannel): boolean {
	if (channel === 'in_app') {
		return true;
	}
	return isEmailChannelAvailable(eventType);
}

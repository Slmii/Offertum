export const NOTIFICATION_EVENT_TYPES = ['opportunity_created', 'customer_reply', 'weekly_digest'] as const;
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

// Default policy when no NotificationPreference row exists for a (user, event, channel).
// In-app defaults ON for every event — the bell icon is non-intrusive and exists to be
// surfaced. Email defaults are asymmetric:
//   - weekly_digest:   ON  — opt-in feature, user expects it
//   - everything else: OFF — per-event emails would flood a typical owner's inbox; users
//                            can opt in explicitly via the settings page
export function defaultNotificationPreference(eventType: NotificationEventType, channel: NotificationChannel): boolean {
	if (channel === 'in_app') {
		return true;
	}
	return eventType === 'weekly_digest';
}

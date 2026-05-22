import type {
	NotificationChannel,
	NotificationEventType,
	NotificationPreference,
	NotificationPreferencesResponse
} from '@quoteom/shared';

export class NotificationPreferenceDto implements NotificationPreference {
	eventType!: NotificationEventType;
	channel!: NotificationChannel;
	enabled!: boolean;
}

export class NotificationPreferencesResponseDto implements NotificationPreferencesResponse {
	preferences!: NotificationPreferenceDto[];
}

import {
	NOTIFICATION_CHANNELS,
	NOTIFICATION_EVENT_TYPES,
	type NotificationChannel,
	type NotificationEventType,
	type UpdateNotificationPreferencesInput
} from '@offertum/shared';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, ValidateNested } from 'class-validator';

class NotificationPreferenceInputDto {
	@IsIn(NOTIFICATION_EVENT_TYPES)
	eventType!: NotificationEventType;

	@IsIn(NOTIFICATION_CHANNELS)
	channel!: NotificationChannel;

	@IsBoolean()
	enabled!: boolean;
}

export class UpdateNotificationPreferencesDto implements UpdateNotificationPreferencesInput {
	@IsArray()
	@ArrayMaxSize(NOTIFICATION_EVENT_TYPES.length * NOTIFICATION_CHANNELS.length)
	@ValidateNested({ each: true })
	@Type(() => NotificationPreferenceInputDto)
	preferences!: NotificationPreferenceInputDto[];
}

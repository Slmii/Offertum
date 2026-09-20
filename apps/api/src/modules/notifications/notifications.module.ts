import {
	NotificationPreferencesController,
	NotificationSettingsController,
	NotificationsController
} from '@/modules/notifications/notifications.controller';
import { NotificationsRepository } from '@/modules/notifications/notifications.repository';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { Module } from '@nestjs/common';

@Module({
	controllers: [NotificationsController, NotificationPreferencesController, NotificationSettingsController],
	providers: [NotificationsService, NotificationsRepository],
	exports: [NotificationsService, NotificationsRepository]
})
export class NotificationsModule {}

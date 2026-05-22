import type { AppNotification, NotificationEventType } from '@quoteom/shared';

export class NotificationResponseDto implements AppNotification {
	id!: string;
	organizationId!: string;
	eventType!: NotificationEventType;
	title!: string;
	body!: string;
	link!: string | null;
	createdAt!: string;
	readAt!: string | null;
}

export class NotificationListResponseDto {
	notifications!: NotificationResponseDto[];
	unreadCount!: number;
}

export class MarkAllReadResponseDto {
	markedCount!: number;
}

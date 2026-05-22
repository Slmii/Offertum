import { serverFetch } from '@/lib/api/server-fetch';
import type { NotificationListResponse, NotificationPreferencesResponse } from '@quoteom/shared';
import { createServerFn } from '@tanstack/react-start';

export const listNotificationsServer = createServerFn({ method: 'GET' })
	.inputValidator((data: void) => data)
	.handler(async () => {
		const response = await serverFetch('/api/me/notifications');
		if (!response.ok) {
			throw new Error(`Failed to load notifications (${response.status})`);
		}
		return (await response.json()) as NotificationListResponse;
	});

export const getNotificationPreferencesServer = createServerFn({ method: 'GET' })
	.inputValidator((data: void) => data)
	.handler(async () => {
		const response = await serverFetch('/api/me/notification-preferences');
		if (!response.ok) {
			throw new Error(`Failed to load notification preferences (${response.status})`);
		}
		return (await response.json()) as NotificationPreferencesResponse;
	});

import { api } from '@/lib/api/client';
import { getNotificationPreferencesServer, listNotificationsServer } from '@/lib/api/notifications.api';
import type { NotificationPreferencesResponse, UpdateNotificationPreferencesInput } from '@offertum/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

const NotificationsKeys = {
	list: ['me', 'notifications'] as const,
	preferences: ['me', 'notification-preferences'] as const
};

// Bell-icon list query. Background-polls every 30s while the tab is focused so the
// badge feels real-time without an SSE channel. `refetchIntervalInBackground` is
// false by default — polling pauses when the tab is hidden, which is what we want
// (zero server load for users who tabbed away). `refetchOnWindowFocus` (default true)
// catches the case where polling paused for hours: on tab refocus the bell refetches
// immediately so the user doesn't stare at stale data.
export const notificationsListQueryOptions = queryOptions({
	queryKey: NotificationsKeys.list,
	queryFn: () => listNotificationsServer(),
	staleTime: 15_000,
	refetchInterval: 30_000
});

export const notificationPreferencesQueryOptions = queryOptions({
	queryKey: NotificationsKeys.preferences,
	queryFn: () => getNotificationPreferencesServer(),
	staleTime: 60_000
});

export function useMarkNotificationRead() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (notificationId: string) =>
			api<void>(`/api/me/notifications/${notificationId}/read`, { method: 'PATCH' }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: NotificationsKeys.list });
		}
	});
}

export function useMarkAllNotificationsRead() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => api<{ markedCount: number }>('/api/me/notifications/mark-all-read', { method: 'POST' }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: NotificationsKeys.list });
		}
	});
}

export function useUpdateNotificationPreferences() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: UpdateNotificationPreferencesInput) =>
			api<void>('/api/me/notification-preferences', { method: 'PUT', body: input }),
		onSuccess: (_data, variables) => {
			// PUT returns 204; merge the optimistic state into the cache.
			queryClient.setQueryData<NotificationPreferencesResponse>(NotificationsKeys.preferences, current => ({
				preferences: variables.preferences,
				...(current ?? {})
			}));
			queryClient.invalidateQueries({ queryKey: NotificationsKeys.preferences });
		}
	});
}

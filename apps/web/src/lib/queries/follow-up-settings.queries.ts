import { api } from '@/lib/api/client';
import { getFollowUpSettingsServer } from '@/lib/api/follow-up-settings.api';
import type { FollowUpSettings, UpdateFollowUpSettingsInput } from '@offertum/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

const FollowUpSettingsKeys = {
	all: ['me', 'follow-up-settings'] as const
};

/**
 * Loader-driven read for the follow-up settings page. Short `staleTime` because
 * the page is the only consumer + the user expects their saves to appear immediately.
 */
export const followUpSettingsQueryOptions = queryOptions({
	queryKey: FollowUpSettingsKeys.all,
	queryFn: () => getFollowUpSettingsServer(),
	staleTime: 15_000
});

/** `PATCH /api/me/follow-up-settings` — owner-only. */
export function useUpdateFollowUpSettings() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (input: UpdateFollowUpSettingsInput) =>
			api<FollowUpSettings>('/api/me/follow-up-settings', {
				method: 'PATCH',
				body: input
			}),
		onSuccess: data => {
			queryClient.setQueryData(FollowUpSettingsKeys.all, data);
		}
	});
}

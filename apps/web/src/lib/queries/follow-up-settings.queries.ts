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
	staleTime: 15_000,
	// The page mirrors this into local state; a window-focus refetch mid-edit would clobber
	// in-progress changes. Settings rarely change out from under the editor.
	refetchOnWindowFocus: false
});

/** `PATCH /api/me/follow-up-settings` — owner-only. */
export function useUpdateFollowUpSettings() {
	const queryClient = useQueryClient();

	return useMutation({
		// Serialize saves: the page persists on every slider commit / toggle, so a shared scope keeps
		// two rapid saves from resolving out of order (older response overwriting the newer one).
		scope: { id: 'follow-up-settings' },
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

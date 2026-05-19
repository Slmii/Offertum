import { api } from '@/lib/api/client';
import { getTonePlaybookServer } from '@/lib/api/tone-playbook.api';
import { TeamKeys } from '@/lib/queries/team.queries';
import type { TonePlaybook, UpdateTonePlaybookInput } from '@quoteom/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

export const TonePlaybookKeys = {
	all: ['me', 'tone-playbook'] as const
};

/**
 * Loader-driven read for the writing-style settings page. Short `staleTime` because the
 * page is the only consumer + the user expects their saves to appear immediately on
 * subsequent reads.
 */
export const tonePlaybookQueryOptions = queryOptions({
	queryKey: TonePlaybookKeys.all,
	queryFn: () => getTonePlaybookServer(),
	staleTime: 15_000
});

/**
 * `PUT /api/me/tone-playbook` — replace the playbook text. Empty string clears it back
 * to the generic baseline. Invalidates the membership cache so the `hasTonePlaybook`
 * boolean (which gates the W5.4 just-in-time banner) updates everywhere else.
 */
export function useUpdateTonePlaybook() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ text }: UpdateTonePlaybookInput) =>
			api<TonePlaybook>('/api/me/tone-playbook', {
				method: 'PUT',
				body: { text }
			}),
		onSuccess: data => {
			queryClient.setQueryData(TonePlaybookKeys.all, data);
			void queryClient.invalidateQueries({ queryKey: TeamKeys.all });
		}
	});
}

import { api } from '@/lib/api/client';
import { getAiAttachmentReadingSettingsServer } from '@/lib/api/ai-attachment-reading-settings.api';
import type { AiAttachmentReadingSettings, UpdateAiAttachmentReadingSettingsInput } from '@offertum/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

const AiAttachmentReadingSettingsKeys = {
	all: ['me', 'ai-attachment-reading-settings'] as const
};

/** Loader-driven read for the `/settings/email` page's "Bijlagen" card. */
export const aiAttachmentReadingSettingsQueryOptions = queryOptions({
	queryKey: AiAttachmentReadingSettingsKeys.all,
	queryFn: () => getAiAttachmentReadingSettingsServer(),
	staleTime: 15_000
});

/** `PATCH /api/me/ai-attachment-reading-settings` — owner-only. */
export function useUpdateAiAttachmentReadingSettings() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (input: UpdateAiAttachmentReadingSettingsInput) =>
			api<AiAttachmentReadingSettings>('/api/me/ai-attachment-reading-settings', {
				method: 'PATCH',
				body: input
			}),
		onSuccess: data => {
			queryClient.setQueryData(AiAttachmentReadingSettingsKeys.all, data);
		}
	});
}

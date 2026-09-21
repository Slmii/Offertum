import { serverFetch } from '@/lib/api/server-fetch';
import type { AiAttachmentReadingSettings } from '@offertum/shared';
import { createServerFn } from '@tanstack/react-start';

/**
 * GET /api/me/ai-attachment-reading-settings — read the active org's "AI reads
 * attachments" toggle. Used by the `/settings/email` route loader. Members can
 * read; only OWNER can mutate (the PATCH endpoint sits behind `@OwnerWrite()`).
 */
export const getAiAttachmentReadingSettingsServer = createServerFn({ method: 'GET' })
	.inputValidator((data: void) => data)
	.handler(async (): Promise<AiAttachmentReadingSettings> => {
		const response = await serverFetch('/api/me/ai-attachment-reading-settings');
		if (!response.ok) {
			throw new Error(`Failed to load AI attachment reading settings (${response.status})`);
		}
		return (await response.json()) as AiAttachmentReadingSettings;
	});

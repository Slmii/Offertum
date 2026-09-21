import type { AiAttachmentReadingSettings } from '@offertum/shared';

/**
 * Response for `GET /api/me/ai-attachment-reading-settings` and
 * `PATCH /api/me/ai-attachment-reading-settings`. Concrete class (not interface) so
 * the OpenAPI spec carries the shape at runtime.
 */
export class AiAttachmentReadingSettingsResponseDto implements AiAttachmentReadingSettings {
	enabled!: boolean;
}

/**
 * Wire-format types for `GET /api/me/ai-attachment-reading-settings` and
 * `PATCH /api/me/ai-attachment-reading-settings`. Owner-only write — the setting
 * controls whether the extraction pipeline reads text out of PDF/Word/Excel
 * attachments on inbound quote requests, or only sees the filenames.
 */

export interface AiAttachmentReadingSettings {
	enabled: boolean;
}

export interface UpdateAiAttachmentReadingSettingsInput {
	enabled: boolean;
}

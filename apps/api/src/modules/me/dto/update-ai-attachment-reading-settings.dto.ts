import type { UpdateAiAttachmentReadingSettingsInput } from '@offertum/shared';
import { Transform } from 'class-transformer';
import { IsBoolean } from 'class-validator';

/**
 * Request body for `PATCH /api/me/ai-attachment-reading-settings`.
 */
export class UpdateAiAttachmentReadingSettingsDto implements UpdateAiAttachmentReadingSettingsInput {
	// The global ValidationPipe runs with `enableImplicitConversion`, which coerces BEFORE
	// validating: the string "false" becomes `true` (non-empty string), as do `1` and `{}`, and
	// `@IsBoolean()` then happily passes. For a privacy switch that is the worst possible way to
	// be wrong — a client sending "false" would turn attachment reading ON. Put the raw JSON value
	// back so the validator judges what was actually sent.
	@Transform(({ obj }: { obj: Record<string, unknown> }) => obj.enabled)
	@IsBoolean()
	enabled!: boolean;
}

import type { AttachQuotePdfInput } from '@offertum/shared';
import { IsUUID, ValidateIf } from 'class-validator';

/**
 * `POST /api/opportunities/:id/reply-draft/quote-pdf` — pick which generated quote PDF
 * version to attach to the reply draft. `null` detaches the current one.
 */
export class AttachQuotePdfDto implements AttachQuotePdfInput {
	@ValidateIf((_, value) => value !== null)
	@IsUUID()
	quotePdfId!: string | null;
}

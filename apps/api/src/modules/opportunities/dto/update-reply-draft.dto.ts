import { REPLY_DRAFT_BODY_MAX_LENGTH, type UpdateReplyDraftInput } from '@quoteom/shared';
import { IsString, MaxLength } from 'class-validator';

/**
 * Body for `PATCH /api/opportunities/:id/reply-draft` — the W5.4 autosave endpoint.
 * Capped at `REPLY_DRAFT_BODY_MAX_LENGTH` server-side.
 */
export class UpdateReplyDraftDto implements UpdateReplyDraftInput {
	@IsString()
	@MaxLength(REPLY_DRAFT_BODY_MAX_LENGTH)
	body!: string;
}

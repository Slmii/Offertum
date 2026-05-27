import { TONE_PLAYBOOK_MAX_LENGTH, type UpdateTonePlaybookInput } from '@offertum/shared';
import { IsString, MaxLength } from 'class-validator';

/**
 * Request body for `PUT /api/me/tone-playbook`. Empty string clears the playbook
 * (server-side trim brings it to `null`). Capped at `TONE_PLAYBOOK_MAX_LENGTH` chars
 * — prose, not a novel.
 */
export class UpdateTonePlaybookDto implements UpdateTonePlaybookInput {
	@IsString()
	@MaxLength(TONE_PLAYBOOK_MAX_LENGTH)
	text!: string;
}

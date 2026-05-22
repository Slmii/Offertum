import { TONE_PLAYBOOK_MAX_LENGTH } from '@quoteom/shared';
import z from 'zod';

// Empty string is valid + meaningful — represents the "no playbook" / generic-Dutch
// baseline. The `Wissen` (clear) action submits `''` to delete the server-side row.
// The Save button's "must have content" check is enforced at the call site (trimmed
// length > 0), not in the schema, so clear-and-save still passes validation.
export const WritingStyleSchema = z.object({
	text: z.string().max(TONE_PLAYBOOK_MAX_LENGTH, `Maximaal ${TONE_PLAYBOOK_MAX_LENGTH} tekens`)
});

export type WritingStyleForm = z.infer<typeof WritingStyleSchema>;

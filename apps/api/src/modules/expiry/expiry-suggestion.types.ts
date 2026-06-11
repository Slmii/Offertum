import { z } from 'zod';

export const expirySuggestionSchema = z.object({
	recommendedAction: z.enum(['EXTEND_14D', 'LAST_FOLLOWUP', 'MARK_LOST']),
	// One short Dutch paragraph the owner reads on the action card — no quote re-pitch.
	suggestedCopy: z.string().min(1).max(600)
});

export type ExpirySuggestion = z.infer<typeof expirySuggestionSchema>;

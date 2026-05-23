import { z } from 'zod';

/**
 * Input to `ShouldReplyClassifier.classify()`. Plain-text body shape — the caller
 * (currently `OpportunitiesService.processOneRawMessage`) is responsible for stripping
 * HTML and the quoted thread before invocation. Same convention as the main classifier
 * + extractor.
 */
export interface ShouldReplyInput {
	subject: string | null;
	fromName: string | null;
	fromEmail: string | null;
	/** Plain text body, quoted prior thread already stripped. Keep ≤ ~4kB. */
	bodyText: string;
}

/**
 * Structured response. `shouldReply` is the only decision the caller acts on:
 *  - `true`  → the message expects a written response (a question, new ask, request for
 *              info). Fire the follow-up event + draft generation.
 *  - `false` → the message is a conversation closer (thanks, acknowledgement, polite
 *              sign-off). Attach to thread for history but skip draft generation + the
 *              "Reactie van klant" notification — the owner doesn't need to write back.
 *
 * `confidence` lets a future caller flag low-confidence cases for manual review
 * (today we treat the boolean as ground truth). `reason` is one short Dutch sentence
 * persisted on the AICall row for debugging accuracy regressions.
 */
export const ShouldReplyResultSchema = z.object({
	shouldReply: z.boolean(),
	confidence: z.number().min(0).max(1),
	reason: z.string()
});

export type ShouldReplyResult = z.infer<typeof ShouldReplyResultSchema>;

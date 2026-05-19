import { z } from 'zod';

/**
 * Input to `ReplyDraftGenerator.generate()`. The generator needs both the structured
 * extraction (so it can address the customer by name + reference the specific work)
 * AND the original email body (so it can pick up any incidental phrasing the customer
 * used — fields the extractor didn't pull out but that would make a reply feel attentive).
 *
 * `tonePlaybookText`: per-user writing-style playbook (D31, W5.2). NULL = use the generic
 * Dutch neutral-professional baseline. Injected verbatim into the prompt.
 *
 * `senderName`: the name to use in the sign-off when the playbook doesn't override it.
 * Comes from `User.name`. May be null if the user never set a name; the prompt falls back
 * to the org's name in that case.
 */
export interface ReplyDraftInput {
	/** Original email context. */
	subject: string | null;
	fromName: string | null;
	fromEmail: string | null;
	bodyText: string;

	/** Extracted opportunity fields — all from the W4.3 extractor output. */
	customerName: string | null;
	address: string | null;
	requestType: string;
	urgency: 'emergency' | 'high' | 'normal' | 'low';
	customerDeadline: string | null;
	customerAppointment: string | null;
	deliverableHints: string[];

	/** Per-user voice. NULL = generic Dutch neutral-professional. */
	tonePlaybookText: string | null;
	/** Used in sign-off when playbook doesn't dictate otherwise. */
	senderName: string | null;
	/** Fallback for sign-off when `senderName` is null. */
	organizationName: string;
}

/**
 * Zod schema for the generator output. Single-field object (rather than a bare string)
 * because OpenAI's Responses API + `zodTextFormat` works against object schemas;
 * structured-outputs JSON-mode wraps the model in a JSON contract. The `body` field is
 * the actual draft text — multi-paragraph plain text (no HTML, no markdown), Dutch.
 */
export const ReplyDraftResultSchema = z.object({
	body: z.string().min(1)
});

export type ReplyDraftResult = z.infer<typeof ReplyDraftResultSchema>;

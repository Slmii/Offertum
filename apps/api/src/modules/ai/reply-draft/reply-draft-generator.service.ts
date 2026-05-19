import { AI_CLIENT, type AIClient, type AIGenerateResult } from '@/modules/ai/clients/ai-client.interface';
import { buildReplyDraftPromptNL } from '@/modules/ai/reply-draft/prompts/nl';
import {
	ReplyDraftResultSchema,
	type ReplyDraftInput,
	type ReplyDraftResult
} from '@/modules/ai/reply-draft/reply-draft.types';
import { Inject, Injectable } from '@nestjs/common';

/**
 * W5.3 — generates a Dutch reply-draft body for a classified-and-extracted Opportunity.
 *
 * Internal service: no controller, no DTO. Consumed by `ReplyDraftsService` (the domain-
 * facing module), which calls this from the `reply-draft-generate` Inngest function and
 * persists the result as a `ReplyDraft` row.
 *
 * **Voice routing:** if `input.tonePlaybookText` is non-null, the prompt injects it
 * verbatim as the voice authority (D31). Null → generic Dutch neutral-professional
 * baseline. Owner-authored always wins.
 *
 * **Language routing (D21):** today only `buildReplyDraftPromptNL` exists. When
 * `Organization.locale` lands, `generate()` will route to the matching prompt builder.
 *
 * **Temperature 0.4:** higher than classifier/extractor (which are 0 for deterministic
 * accuracy). The reply-draft is creative text — exact reproducibility on retry isn't a
 * win, and 0 produces noticeably stilted Dutch. 0.4 keeps the output natural while still
 * being predictable enough for fixture tests to assert on field-reference content.
 */
@Injectable()
export class ReplyDraftGenerator {
	constructor(@Inject(AI_CLIENT) private readonly ai: AIClient) {}

	async generate(input: ReplyDraftInput): Promise<AIGenerateResult<ReplyDraftResult>> {
		const prompt = buildReplyDraftPromptNL(input);
		return this.ai.generate({
			purpose: 'reply-draft',
			prompt,
			schema: ReplyDraftResultSchema,
			temperature: 0.4
		});
	}
}

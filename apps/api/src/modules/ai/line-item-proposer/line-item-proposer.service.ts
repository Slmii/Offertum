import { AI_CLIENT, type AIClient, type AIGenerateResult } from '@/modules/ai/clients/ai-client.interface';
import {
	LineItemProposalSchema,
	type LineItemProposal,
	type LineItemProposerInput
} from '@/modules/ai/line-item-proposer/line-item-proposer.types';
import { buildLineItemProposerPromptNL } from '@/modules/ai/line-item-proposer/prompts/nl';
import { Inject, Injectable } from '@nestjs/common';

/**
 * W10.1 line-item proposer — the "LLM-match" half of the LLM-match / engine-price
 * design. Given an opportunity + the org's catalog (no prices), the model returns
 * which catalog items apply (by short ref) + quantities, plus any non-catalog
 * work. It produces ZERO prices; the deterministic price-resolution layer
 * (`QuoteLineItemsService`) turns refs into priced lines using the catalog rows +
 * the pricing-rule engine.
 *
 * Internal service: no controller, no DTO. Consumed by `QuoteLineItemsService`.
 * Mirrors the classifier/extractor pattern — single `AIClient` seam, Zod-enforced
 * structured output, low temperature for reproducibility.
 *
 * Language routing: today only `buildLineItemProposerPromptNL` exists. When
 * `Organization.locale` lands, `propose()` routes to the matching prompt builder.
 */
@Injectable()
export class LineItemProposerService {
	constructor(@Inject(AI_CLIENT) private readonly ai: AIClient) {}

	async propose(input: LineItemProposerInput): Promise<AIGenerateResult<LineItemProposal>> {
		const prompt = buildLineItemProposerPromptNL(input);
		return this.ai.generate({
			purpose: 'line-item-proposer',
			prompt,
			schema: LineItemProposalSchema,
			// Deterministic matching: any non-zero temperature makes the catalog-match
			// fixture accuracy assertions flap run-to-run.
			temperature: 0
		});
	}
}

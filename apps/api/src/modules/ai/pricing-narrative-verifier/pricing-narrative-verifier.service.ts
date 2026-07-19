import { AI_CLIENT, type AIClient, type AIGenerateResult } from '@/modules/ai/clients/ai-client.interface';
import {
	PricingNarrativeVerificationSchema,
	type PricingNarrativeVerification,
	type PricingNarrativeVerifierInput
} from '@/modules/ai/pricing-narrative-verifier/pricing-narrative-verifier.types';
import { buildPricingNarrativeVerifierPromptNL } from '@/modules/ai/pricing-narrative-verifier/prompts/nl';
import { Inject, Injectable } from '@nestjs/common';

/**
 * The "AI controleert" half of pricing-rule evaluation. Structured conditions are
 * matched deterministically by the rule engine; free-text `conditionNarrative`s can't
 * be, so this service asks the model — per quote — whether each narrative applies.
 * Only confirmed rules reach the engine (see `QuoteLineItemsService.generate`).
 *
 * Internal service: no controller, no DTO. Mirrors the classifier/extractor/proposer
 * pattern — single `AIClient` seam, Zod-enforced structured output, temperature 0 for
 * reproducibility. Every call writes one `AICall` row (purpose `pricing-narrative-verify`)
 * so spend + decisions are auditable alongside the rest of the AI pipeline.
 *
 * Language routing: today only `buildPricingNarrativeVerifierPromptNL` exists. When
 * `Organization.locale` lands, `verify()` routes to the matching prompt builder.
 */
@Injectable()
export class PricingNarrativeVerifierService {
	constructor(@Inject(AI_CLIENT) private readonly ai: AIClient) {}

	async verify(input: PricingNarrativeVerifierInput): Promise<AIGenerateResult<PricingNarrativeVerification>> {
		const prompt = buildPricingNarrativeVerifierPromptNL(input);
		return this.ai.generate({
			purpose: 'pricing-narrative-verify',
			prompt,
			schema: PricingNarrativeVerificationSchema,
			// Deterministic verdicts: a non-zero temperature would make the same quote
			// flip a narrative on/off run-to-run and produce non-reproducible pricing.
			temperature: 0
		});
	}
}

import { createHash } from 'node:crypto';

import { AI_CLIENT, type AIClient, type AIGenerateResult } from '@/modules/ai/clients/ai-client.interface';
import {
	PricingPlaybookCompileSchema,
	type PricingPlaybookCompileOutput
} from '@/modules/pricing-playbook/compile/compile.types';
import { buildPricingPlaybookCompilePromptNL } from '@/modules/pricing-playbook/compile/prompts/nl';
import { Inject, Injectable } from '@nestjs/common';

/**
 * Runs the LLM compile pass that turns playbook prose into typed pricing rules.
 *
 * Single responsibility: the LLM call. Persistence (upsert / preserve / deactivate
 * logic) lives in `PricingPlaybookService.applyCompileOutput` — keeps the AI surface
 * mockable in tests without dragging Prisma into the unit harness.
 *
 * Empty / whitespace-only prose short-circuits with an empty result before the LLM
 * call — saves an OpenAI token spend on the no-op case (fresh org with empty
 * playbook).
 */
@Injectable()
export class PricingPlaybookCompileService {
	constructor(@Inject(AI_CLIENT) private readonly ai: AIClient) {}

	/**
	 * Compute the sha256 hash of the playbook text — used as `compiledHash` so the
	 * compile function can no-op when re-triggered on identical prose (Inngest
	 * retry, fast successive saves that collapse to the same final state).
	 */
	hashPlaybookText(playbookText: string): string {
		return createHash('sha256').update(playbookText).digest('hex');
	}

	async compile(playbookText: string): Promise<AIGenerateResult<PricingPlaybookCompileOutput>> {
		const trimmed = playbookText.trim();
		if (trimmed.length === 0) {
			// Cheap zero-cost short-circuit. Caller still calls `applyCompileOutput`
			// with `{ rules: [] }` so any existing rules from a previous compile get
			// deactivated correctly.
			return {
				value: { rules: [] },
				provider: 'noop',
				model: 'noop',
				callId: null
			};
		}

		return this.ai.generate({
			purpose: 'pricing-playbook-compile',
			prompt: buildPricingPlaybookCompilePromptNL(playbookText),
			schema: PricingPlaybookCompileSchema,
			// Low temperature so the same prose → the same rule set across re-compiles.
			// Critical for the "no-op on unchanged text" hash check to actually no-op
			// (with temp > 0 the LLM might emit slightly different priorities or
			// descriptions on each run, creating churn even though semantic intent
			// is unchanged).
			temperature: 0
		});
	}
}

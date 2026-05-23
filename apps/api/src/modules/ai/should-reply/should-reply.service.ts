import { AI_CLIENT, type AIClient, type AIGenerateResult } from '@/modules/ai/clients/ai-client.interface';
import { buildShouldReplyPromptNL } from '@/modules/ai/should-reply/prompts/nl';
import {
	ShouldReplyResultSchema,
	type ShouldReplyInput,
	type ShouldReplyResult
} from '@/modules/ai/should-reply/should-reply.types';
import { Inject, Injectable } from '@nestjs/common';

/**
 * Decides whether a customer reply on a tracked thread expects a written answer.
 * Runs AFTER thread reconstitution has matched the message to an existing Opportunity
 * (so the call is bounded — never runs on first-touch inbound mail, only on
 * follow-ups). The caller (OpportunitiesService) suppresses the draft generation +
 * "Reactie van klant" notification when this returns `shouldReply: false`.
 *
 * Cost profile: one cheap-model call per customer reply on a tracked thread. At a
 * typical SMB scale that's a handful per day per org, so the OpenAI bill stays in
 * the cents-per-month range.
 */
@Injectable()
export class ShouldReplyClassifier {
	constructor(@Inject(AI_CLIENT) private readonly ai: AIClient) {}

	async classify(input: ShouldReplyInput): Promise<AIGenerateResult<ShouldReplyResult>> {
		const prompt = buildShouldReplyPromptNL(input);
		return this.ai.generate({
			purpose: 'should-reply',
			prompt,
			schema: ShouldReplyResultSchema,
			// Zero temperature so the same closure phrase always lands on the same side
			// of the boundary — no flapping between "yes draft" and "no draft" when the
			// model is rerun on identical input.
			temperature: 0
		});
	}
}

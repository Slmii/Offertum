import { AI_CLIENT } from '@/modules/ai/clients/ai-client.interface';
import { OpenAIClient } from '@/modules/ai/clients/openai-client.service';
import { ClassifierService } from '@/modules/ai/classifier/classifier.service';
import { ExtractorService } from '@/modules/ai/extractor/extractor.service';
import { LineItemProposerService } from '@/modules/ai/line-item-proposer/line-item-proposer.service';
import { AICallLogger } from '@/modules/ai/logging/ai-call-logger.service';
import { ReplyDraftGenerator } from '@/modules/ai/reply-draft/reply-draft-generator.service';
import { ShouldReplyClassifier } from '@/modules/ai/should-reply/should-reply.service';
import { Module } from '@nestjs/common';

/**
 * AI extraction pipeline.
 *
 * Surface:
 *  - `AI_CLIENT` token bound to a concrete `AIClient` implementation (today: `OpenAIClient`,
 *    swappable later for Mistral/Anthropic).
 *  - `AICallLogger` — exported so non-AI services can also log calls if they fire LLMs
 *    via custom paths (none today; future-proofing).
 *  - `ClassifierService` — "is this an offerteaanvraag?" decision. Consumed by the
 *    Opportunity creation flow.
 *
 * Downstream consumers (`ClassifierService`, `ExtractorService`, etc.) inject the
 * AI client via `@Inject(AI_CLIENT) private readonly ai: AIClient`. They don't know or
 * care which provider sits behind it.
 *
 * Provider lock-in is mechanical: swap `useClass: OpenAIClient` for `useClass:
 * MistralClient` or `useClass: AnthropicClient`. Caller code doesn't change.
 */
@Module({
	providers: [
		AICallLogger,
		OpenAIClient,
		{
			provide: AI_CLIENT,
			useExisting: OpenAIClient
		},
		ClassifierService,
		ExtractorService,
		ReplyDraftGenerator,
		ShouldReplyClassifier,
		LineItemProposerService
	],
	exports: [
		AI_CLIENT,
		AICallLogger,
		ClassifierService,
		ExtractorService,
		ReplyDraftGenerator,
		ShouldReplyClassifier,
		LineItemProposerService
	]
})
export class AiModule {}

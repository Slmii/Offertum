import { AiModule } from '@/modules/ai/ai.module';
import { ReplyDraftsRepository } from '@/modules/reply-drafts/reply-drafts.repository';
import { ReplyDraftsService } from '@/modules/reply-drafts/reply-drafts.service';
import { Module } from '@nestjs/common';

/**
 * W5.3 — reply-draft generation. Composes the AI generator (`ReplyDraftGenerator` in
 * `AiModule`) with a Prisma-backed repository to produce `ReplyDraft` rows after each
 * Opportunity is created. The Inngest function `reply-draft-generate` is the primary
 * caller; W5.4 will add a manual "regenerate" controller endpoint when the detail view
 * lands.
 *
 * Exports `ReplyDraftsService` so the Inngest module can call it without re-importing
 * the AI module dependency chain.
 */
@Module({
	imports: [AiModule],
	providers: [ReplyDraftsService, ReplyDraftsRepository],
	exports: [ReplyDraftsService]
})
export class ReplyDraftsModule {}

import { AiModule } from '@/modules/ai/ai.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { OpportunitiesController } from '@/modules/opportunities/opportunities.controller';
import { OpportunitiesRepository } from '@/modules/opportunities/opportunities.repository';
import { OpportunitiesService } from '@/modules/opportunities/opportunities.service';
import { ReplyDraftAttachmentsModule } from '@/modules/reply-draft-attachments/reply-draft-attachments.module';
import { ReplyDraftsModule } from '@/modules/reply-drafts/reply-drafts.module';
import { Module } from '@nestjs/common';

@Module({
	imports: [AiModule, ReplyDraftsModule, ReplyDraftAttachmentsModule, NotificationsModule],
	controllers: [OpportunitiesController],
	providers: [OpportunitiesRepository, OpportunitiesService],
	// `OpportunitiesRepository` exported so InngestModule's `AutoColdSchedulerFunction`
	// can run its candidate query + bulk status flip directly. Same pattern as
	// `ReplyDraftsRepository` exposed for the silence-check-in scheduler.
	exports: [OpportunitiesService, OpportunitiesRepository]
})
export class OpportunitiesModule {}

import { AiModule } from '@/modules/ai/ai.module';
import { ExpiryController } from '@/modules/expiry/expiry.controller';
import { ExpiryRepository } from '@/modules/expiry/expiry.repository';
import { ExpiryService } from '@/modules/expiry/expiry.service';
import { OpportunitiesModule } from '@/modules/opportunities/opportunities.module';
import { ReplyDraftsModule } from '@/modules/reply-drafts/reply-drafts.module';
import { Module } from '@nestjs/common';

/**
 * Smart-expiry feature module (W13). PrismaService + LogService are provided globally,
 * so only the AI seam + the two reused generators (reply-draft + opportunity status)
 * need importing.
 */
@Module({
	imports: [AiModule, ReplyDraftsModule, OpportunitiesModule],
	controllers: [ExpiryController],
	providers: [ExpiryRepository, ExpiryService],
	exports: [ExpiryService, ExpiryRepository]
})
export class ExpiryModule {}

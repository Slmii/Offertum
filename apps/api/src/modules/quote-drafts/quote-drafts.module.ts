import { QuoteDraftLineItemsController } from '@/modules/quote-drafts/quote-draft-line-items.controller';
import { QuoteDraftsController } from '@/modules/quote-drafts/quote-drafts.controller';
import { QuoteDraftsRepository } from '@/modules/quote-drafts/quote-drafts.repository';
import { QuoteDraftsService } from '@/modules/quote-drafts/quote-drafts.service';
import { QuoteLineItemsModule } from '@/modules/quote-line-items/quote-line-items.module';
import { Module } from '@nestjs/common';

@Module({
	imports: [QuoteLineItemsModule],
	controllers: [QuoteDraftsController, QuoteDraftLineItemsController],
	providers: [QuoteDraftsService, QuoteDraftsRepository],
	exports: [QuoteDraftsService]
})
export class QuoteDraftsModule {}

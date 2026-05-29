import { CatalogItemsModule } from '@/modules/catalog-items/catalog-items.module';
import { OpportunitiesModule } from '@/modules/opportunities/opportunities.module';
import { QuoteDraftLineItemsController } from '@/modules/quote-drafts/quote-draft-line-items.controller';
import { QuoteDraftPdfController } from '@/modules/quote-drafts/quote-draft-pdf.controller';
import { QuoteDraftsController } from '@/modules/quote-drafts/quote-drafts.controller';
import { QuoteDraftsRepository } from '@/modules/quote-drafts/quote-drafts.repository';
import { QuoteDraftsService } from '@/modules/quote-drafts/quote-drafts.service';
import { QuoteLineItemsModule } from '@/modules/quote-line-items/quote-line-items.module';
import { PricingPlaybookModule } from '@/modules/pricing-playbook/pricing-playbook.module';
import { QuotePdfsModule } from '@/modules/quote-pdfs/quote-pdfs.module';
import { Module } from '@nestjs/common';

@Module({
	imports: [QuoteLineItemsModule, PricingPlaybookModule, CatalogItemsModule, OpportunitiesModule, QuotePdfsModule],
	controllers: [QuoteDraftsController, QuoteDraftLineItemsController, QuoteDraftPdfController],
	providers: [QuoteDraftsService, QuoteDraftsRepository],
	exports: [QuoteDraftsService]
})
export class QuoteDraftsModule {}

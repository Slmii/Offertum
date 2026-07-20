import { GeoModule } from '@/lib/geo/geo.module';
import { AiModule } from '@/modules/ai/ai.module';
import { CatalogItemsModule } from '@/modules/catalog-items/catalog-items.module';
import { OpportunitiesModule } from '@/modules/opportunities/opportunities.module';
import { PricingPlaybookModule } from '@/modules/pricing-playbook/pricing-playbook.module';
import { QuoteLineItemsController } from '@/modules/quote-line-items/quote-line-items.controller';
import { QuoteLineItemsService } from '@/modules/quote-line-items/quote-line-items.service';
import { Module } from '@nestjs/common';

@Module({
	imports: [GeoModule, AiModule, CatalogItemsModule, OpportunitiesModule, PricingPlaybookModule],
	controllers: [QuoteLineItemsController],
	providers: [QuoteLineItemsService],
	exports: [QuoteLineItemsService]
})
export class QuoteLineItemsModule {}

import { CatalogItemsController } from '@/modules/catalog-items/catalog-items.controller';
import { CatalogItemsRepository } from '@/modules/catalog-items/catalog-items.repository';
import { CatalogItemsService } from '@/modules/catalog-items/catalog-items.service';
import { Module } from '@nestjs/common';

@Module({
	controllers: [CatalogItemsController],
	providers: [CatalogItemsService, CatalogItemsRepository],
	exports: [CatalogItemsService, CatalogItemsRepository]
})
export class CatalogItemsModule {}

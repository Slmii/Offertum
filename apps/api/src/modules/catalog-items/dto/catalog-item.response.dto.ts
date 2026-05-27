import type { CatalogItem, CatalogItemUnit } from '@quoteom/shared';

export class CatalogItemResponseDto implements CatalogItem {
	id!: string;
	organizationId!: string;
	name!: string;
	description!: string | null;
	defaultPriceEur!: string;
	defaultVatRate!: number;
	sku!: string | null;
	unit!: CatalogItemUnit;
	active!: boolean;
	createdAt!: string;
	updatedAt!: string;
}

export class CatalogItemListResponseDto {
	items!: CatalogItemResponseDto[];
}

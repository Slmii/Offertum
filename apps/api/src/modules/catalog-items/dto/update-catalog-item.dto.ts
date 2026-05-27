import {
	CATALOG_ITEM_DESCRIPTION_MAX_LENGTH,
	CATALOG_ITEM_NAME_MAX_LENGTH,
	CATALOG_ITEM_SKU_MAX_LENGTH,
	CATALOG_ITEM_UNITS,
	type CatalogItemUnit,
	type UpdateCatalogItemInput
} from '@quoteom/shared';
import {
	IsBoolean,
	IsIn,
	IsInt,
	IsOptional,
	IsString,
	Matches,
	Max,
	MaxLength,
	Min,
	MinLength,
	ValidateIf
} from 'class-validator';

export class UpdateCatalogItemDto implements UpdateCatalogItemInput {
	@IsOptional()
	@IsString()
	@MinLength(1)
	@MaxLength(CATALOG_ITEM_NAME_MAX_LENGTH)
	name?: string;

	@ValidateIf((_, value) => value !== null)
	@IsOptional()
	@IsString()
	@MaxLength(CATALOG_ITEM_DESCRIPTION_MAX_LENGTH)
	description?: string | null;

	@IsOptional()
	@IsString()
	@Matches(/^\d+(\.\d{1,2})?$/, { message: 'defaultPriceEur must be a decimal with up to 2 decimal places' })
	defaultPriceEur?: string;

	@IsOptional()
	@IsInt()
	@Min(0)
	@Max(30)
	defaultVatRate?: number;

	@ValidateIf((_, value) => value !== null)
	@IsOptional()
	@IsString()
	@MaxLength(CATALOG_ITEM_SKU_MAX_LENGTH)
	sku?: string | null;

	@IsOptional()
	@IsIn(CATALOG_ITEM_UNITS)
	unit?: CatalogItemUnit;

	@IsOptional()
	@IsBoolean()
	active?: boolean;
}

import {
	CATALOG_ITEM_DESCRIPTION_MAX_LENGTH,
	CATALOG_ITEM_NAME_MAX_LENGTH,
	CATALOG_ITEM_SKU_MAX_LENGTH,
	CATALOG_ITEM_UNITS,
	type CatalogItemUnit,
	type UpdateCatalogItemInput
} from '@offertum/shared';
import {
	CATALOG_ITEM_PRICE_MESSAGE,
	CATALOG_ITEM_PRICE_PATTERN
} from '@/modules/catalog-items/dto/catalog-item-price.dto';
import { NON_WHITESPACE_MESSAGE, NON_WHITESPACE_PATTERN } from '@/lib/validators/non-whitespace-pattern';
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
	@Matches(NON_WHITESPACE_PATTERN, { message: `name ${NON_WHITESPACE_MESSAGE}` })
	name?: string;

	@ValidateIf((_, value) => value !== null)
	@IsOptional()
	@IsString()
	@MaxLength(CATALOG_ITEM_DESCRIPTION_MAX_LENGTH)
	description?: string | null;

	@IsOptional()
	@IsString()
	@Matches(CATALOG_ITEM_PRICE_PATTERN, { message: CATALOG_ITEM_PRICE_MESSAGE })
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

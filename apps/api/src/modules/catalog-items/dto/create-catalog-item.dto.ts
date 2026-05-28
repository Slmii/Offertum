import {
	CATALOG_ITEM_DESCRIPTION_MAX_LENGTH,
	CATALOG_ITEM_NAME_MAX_LENGTH,
	CATALOG_ITEM_SKU_MAX_LENGTH,
	CATALOG_ITEM_UNITS,
	type CatalogItemUnit,
	type CreateCatalogItemInput
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

/**
 * `POST /api/catalog-items`. `defaultPriceEur` is a string at the wire layer
 * to preserve decimal precision through JSON; format `^\d+(\.\d{1,2})?$`
 * matches Prisma's Decimal(10, 2) bounds. `unit` is a closed enum — the
 * dropdown in the settings UI is the only sanctioned input surface.
 */
export class CreateCatalogItemDto implements CreateCatalogItemInput {
	@IsString()
	@MinLength(1)
	@MaxLength(CATALOG_ITEM_NAME_MAX_LENGTH)
	@Matches(NON_WHITESPACE_PATTERN, { message: `name ${NON_WHITESPACE_MESSAGE}` })
	name!: string;

	@ValidateIf((_, value) => value !== null)
	@IsOptional()
	@IsString()
	@MaxLength(CATALOG_ITEM_DESCRIPTION_MAX_LENGTH)
	description?: string | null;

	@IsString()
	@Matches(CATALOG_ITEM_PRICE_PATTERN, { message: CATALOG_ITEM_PRICE_MESSAGE })
	defaultPriceEur!: string;

	@IsInt()
	@Min(0)
	@Max(30)
	defaultVatRate!: number;

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

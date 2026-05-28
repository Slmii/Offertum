import { CATALOG_ITEM_DESCRIPTION_MAX_LENGTH, CATALOG_ITEM_UNITS, type CatalogItemUnit } from '@offertum/shared';
import {
	CATALOG_ITEM_PRICE_MESSAGE,
	CATALOG_ITEM_PRICE_PATTERN
} from '@/modules/catalog-items/dto/catalog-item-price.dto';
import { NON_WHITESPACE_MESSAGE, NON_WHITESPACE_PATTERN } from '@/lib/validators/non-whitespace-pattern';
import { Type } from 'class-transformer';
import {
	ArrayMaxSize,
	ArrayMinSize,
	IsArray,
	IsIn,
	IsNumber,
	IsOptional,
	IsString,
	Matches,
	Max,
	MaxLength,
	Min,
	MinLength,
	ValidateIf,
	ValidateNested
} from 'class-validator';

/**
 * Upper bound on line items per quote. A real quote rarely exceeds a few dozen lines;
 * the cap is a DoS guard so an oversized payload can't make the PDF renderer allocate
 * unbounded memory. Bump if a genuine use case needs more.
 */
const MAX_QUOTE_LINE_ITEMS = 200;

export class PreviewQuotePdfLineItemDto {
	@IsString()
	@MinLength(1)
	@MaxLength(CATALOG_ITEM_DESCRIPTION_MAX_LENGTH)
	@Matches(NON_WHITESPACE_PATTERN, { message: `description ${NON_WHITESPACE_MESSAGE}` })
	description!: string;

	@IsIn(CATALOG_ITEM_UNITS)
	unit!: CatalogItemUnit;

	@IsString()
	@Matches(CATALOG_ITEM_PRICE_PATTERN, { message: CATALOG_ITEM_PRICE_MESSAGE })
	unitPriceEur!: string;

	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0.01)
	@Max(999_999)
	quantity!: number;

	@IsNumber()
	@Min(0)
	@Max(30)
	vatRate!: number;
}

export class PreviewQuotePdfDto {
	@IsString()
	@MinLength(1)
	@MaxLength(200)
	@Matches(NON_WHITESPACE_PATTERN, { message: `customerName ${NON_WHITESPACE_MESSAGE}` })
	customerName!: string;

	@IsArray()
	@ArrayMinSize(1)
	@ArrayMaxSize(MAX_QUOTE_LINE_ITEMS)
	@ValidateNested({ each: true })
	@Type(() => PreviewQuotePdfLineItemDto)
	lineItems!: PreviewQuotePdfLineItemDto[];

	@IsOptional()
	@IsString()
	@MinLength(1)
	@MaxLength(80)
	@Matches(NON_WHITESPACE_PATTERN, { message: `quoteNumber ${NON_WHITESPACE_MESSAGE}` })
	quoteNumber?: string;

	@ValidateIf((_, value) => value !== null)
	@IsOptional()
	@IsString()
	@MaxLength(320)
	customerEmail?: string | null;

	@ValidateIf((_, value) => value !== null)
	@IsOptional()
	@IsString()
	@MaxLength(2_000)
	customerAddress?: string | null;
}

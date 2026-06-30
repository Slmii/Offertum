import {
	MONEY_DECIMAL_MESSAGE,
	MONEY_DECIMAL_PATTERN,
	QUANTITY_DECIMAL_MESSAGE,
	QUANTITY_DECIMAL_PATTERN
} from '@/lib/validators/decimal-string';
import { NON_WHITESPACE_MESSAGE, NON_WHITESPACE_PATTERN } from '@/lib/validators/non-whitespace-pattern';
import {
	QUOTE_LINE_DESCRIPTION_MAX_LENGTH,
	QUOTE_LINE_SOURCES,
	VAT_RATE_MAX_DECIMALS,
	type QuoteLineSource,
	type ReplaceQuoteLineInput,
	type ReplaceQuoteLinesInput
} from '@offertum/shared';
import { Type } from 'class-transformer';
import {
	ArrayMaxSize,
	IsArray,
	IsBoolean,
	IsIn,
	IsNumber,
	IsString,
	Matches,
	Max,
	MaxLength,
	Min,
	MinLength,
	ValidateIf,
	ValidateNested
} from 'class-validator';

// VAT is a percentage (0-100); the engine derives a line's rate from the owner's VAT
// rules, so range-validate rather than hardcode {0,9,21}.
const MIN_VAT_RATE = 0;
const MAX_VAT_RATE = 100;
const SOURCES: string[] = [...QUOTE_LINE_SOURCES];
const MAX_QUOTE_LINE_ITEMS = 200;

class ReplaceQuoteLineItemDto implements ReplaceQuoteLineInput {
	@IsString()
	@MinLength(1)
	@MaxLength(QUOTE_LINE_DESCRIPTION_MAX_LENGTH)
	@Matches(NON_WHITESPACE_PATTERN, { message: `description ${NON_WHITESPACE_MESSAGE}` })
	description!: string;

	@IsString()
	@MinLength(1)
	unit!: string;

	@IsString()
	@Matches(QUANTITY_DECIMAL_PATTERN, { message: `quantity ${QUANTITY_DECIMAL_MESSAGE}` })
	quantity!: string;

	@ValidateIf((_, value) => value !== null)
	@IsString()
	@Matches(MONEY_DECIMAL_PATTERN, { message: `unitPriceEur ${MONEY_DECIMAL_MESSAGE}` })
	unitPriceEur!: string | null;

	@IsNumber({ maxDecimalPlaces: VAT_RATE_MAX_DECIMALS })
	@Min(MIN_VAT_RATE)
	@Max(MAX_VAT_RATE)
	vatRate!: number;

	@IsBoolean()
	vatReverseCharged!: boolean;

	@IsIn(SOURCES)
	source!: QuoteLineSource;

	@IsBoolean()
	wasEditedByUser!: boolean;

	@ValidateIf((_, value) => value !== null)
	@IsString()
	catalogItemId!: string | null;

	@ValidateIf((_, value) => value !== null)
	@IsString()
	appliedRuleId!: string | null;

	@ValidateIf((_, value) => value !== null)
	@IsString()
	note!: string | null;
}

/** `PUT /api/quote-drafts/:id/line-items` — replace the draft's lines wholesale. */
export class ReplaceQuoteLinesDto implements ReplaceQuoteLinesInput {
	@IsArray()
	@ArrayMaxSize(MAX_QUOTE_LINE_ITEMS)
	@ValidateNested({ each: true })
	@Type(() => ReplaceQuoteLineItemDto)
	lines!: ReplaceQuoteLineItemDto[];
}

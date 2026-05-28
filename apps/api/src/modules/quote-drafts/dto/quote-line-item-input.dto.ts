import { NON_WHITESPACE_MESSAGE, NON_WHITESPACE_PATTERN } from '@/lib/validators/non-whitespace-pattern';
import {
	MONEY_DECIMAL_MESSAGE,
	MONEY_DECIMAL_PATTERN,
	QUANTITY_DECIMAL_MESSAGE,
	QUANTITY_DECIMAL_PATTERN
} from '@/lib/validators/decimal-string';
import {
	QUOTE_LINE_DESCRIPTION_MAX_LENGTH,
	type CreateQuoteLineItemInput,
	type UpdateQuoteLineItemInput
} from '@offertum/shared';
import {
	IsBoolean,
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

// VAT is a percentage (0-100). The pricing engine derives a line's rate from the
// owner's VAT rules, so range-validate rather than hardcode {0,9,21}; the UI dropdown
// is what constrains manual edits to the common NL brackets.
const MIN_VAT_RATE = 0;
const MAX_VAT_RATE = 100;

/** `POST /api/quote-drafts/:id/line-items` — add an owner-authored line. */
export class CreateQuoteLineItemDto implements CreateQuoteLineItemInput {
	@IsString()
	@MinLength(1)
	@MaxLength(QUOTE_LINE_DESCRIPTION_MAX_LENGTH)
	@Matches(NON_WHITESPACE_PATTERN, { message: `description ${NON_WHITESPACE_MESSAGE}` })
	description!: string;

	@IsString()
	@Matches(QUANTITY_DECIMAL_PATTERN, { message: `quantity ${QUANTITY_DECIMAL_MESSAGE}` })
	quantity!: string;

	@ValidateIf((_, value) => value !== null)
	@IsString()
	@Matches(MONEY_DECIMAL_PATTERN, { message: `unitPriceEur ${MONEY_DECIMAL_MESSAGE}` })
	unitPriceEur!: string | null;

	@IsInt()
	@Min(MIN_VAT_RATE)
	@Max(MAX_VAT_RATE)
	vatRate!: number;

	@IsBoolean()
	vatReverseCharged!: boolean;

	@IsOptional()
	@IsString()
	@MinLength(1)
	unit?: string;
}

/** `PATCH /api/quote-drafts/:id/line-items/:lineId` — every field optional. */
export class UpdateQuoteLineItemDto implements UpdateQuoteLineItemInput {
	@IsOptional()
	@IsString()
	@MinLength(1)
	@MaxLength(QUOTE_LINE_DESCRIPTION_MAX_LENGTH)
	@Matches(NON_WHITESPACE_PATTERN, { message: `description ${NON_WHITESPACE_MESSAGE}` })
	description?: string;

	@IsOptional()
	@IsString()
	@Matches(QUANTITY_DECIMAL_PATTERN, { message: `quantity ${QUANTITY_DECIMAL_MESSAGE}` })
	quantity?: string;

	@ValidateIf((_, value) => value !== null && value !== undefined)
	@IsString()
	@Matches(MONEY_DECIMAL_PATTERN, { message: `unitPriceEur ${MONEY_DECIMAL_MESSAGE}` })
	unitPriceEur?: string | null;

	@IsOptional()
	@IsInt()
	@Min(MIN_VAT_RATE)
	@Max(MAX_VAT_RATE)
	vatRate?: number;

	@IsOptional()
	@IsBoolean()
	vatReverseCharged?: boolean;

	@IsOptional()
	@IsString()
	@MinLength(1)
	unit?: string;

	@IsOptional()
	@IsInt()
	@Min(0)
	position?: number;
}

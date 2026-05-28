import { NON_WHITESPACE_MESSAGE, NON_WHITESPACE_PATTERN } from '@/lib/validators/non-whitespace-pattern';
import {
	MONEY_DECIMAL_MESSAGE,
	MONEY_DECIMAL_PATTERN,
	QUANTITY_DECIMAL_MESSAGE,
	QUANTITY_DECIMAL_PATTERN
} from '@/lib/validators/decimal-string';
import {
	QUOTE_LINE_DESCRIPTION_MAX_LENGTH,
	QUOTE_VAT_RATES,
	type CreateQuoteLineItemInput,
	type UpdateQuoteLineItemInput
} from '@offertum/shared';
import {
	IsBoolean,
	IsIn,
	IsInt,
	IsOptional,
	IsString,
	Matches,
	MaxLength,
	Min,
	MinLength,
	ValidateIf
} from 'class-validator';

const VAT_RATES: number[] = [...QUOTE_VAT_RATES];

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
	@IsIn(VAT_RATES)
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
	@IsIn(VAT_RATES)
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

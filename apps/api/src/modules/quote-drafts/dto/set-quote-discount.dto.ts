import { MONEY_DECIMAL_MESSAGE, MONEY_DECIMAL_PATTERN } from '@/lib/validators/decimal-string';
import type { QuoteDiscountType } from '@offertum/shared';
import { IsIn, IsString, Matches, ValidateIf } from 'class-validator';

/**
 * `PATCH /api/opportunities/:opportunityId/quote-drafts/:quoteDraftId/discount` — set or
 * clear the quote-level discount. `type: null` clears both fields; otherwise `value` is
 * required (a percentage 0-100 for `percent`, a euro amount for `eur` — range-checked
 * in the service, since it depends on `type`).
 */
export class SetQuoteDiscountDto {
	@ValidateIf((_, value) => value !== null)
	@IsIn(['percent', 'eur'])
	type!: QuoteDiscountType | null;

	@ValidateIf((_, value) => value !== null)
	@IsString()
	@Matches(MONEY_DECIMAL_PATTERN, { message: `value ${MONEY_DECIMAL_MESSAGE}` })
	value!: string | null;
}

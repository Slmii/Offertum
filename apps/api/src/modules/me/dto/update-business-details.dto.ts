import {
	COMPANY_ADDRESS_MAX_LENGTH,
	COMPANY_FOOTER_MAX_LENGTH,
	COMPANY_NAME_MAX_LENGTH,
	COMPANY_PHONE_MAX_LENGTH,
	COMPANY_REGISTRATION_NUMBER_MAX_LENGTH,
	COMPANY_VAT_MAX_LENGTH,
	COMPANY_WEBSITE_MAX_LENGTH,
	PAYMENT_TERMS_DAYS_MAX,
	PAYMENT_TERMS_DAYS_MIN,
	QUOTE_VALIDITY_DAYS_MAX,
	QUOTE_VALIDITY_DAYS_MIN,
	VERTICAL_VALUES,
	type UpdateBusinessDetailsInput,
	type VerticalValue
} from '@offertum/shared';
import { NON_WHITESPACE_MESSAGE, NON_WHITESPACE_PATTERN } from '@/lib/validators/non-whitespace-pattern';
import {
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
 * Request body for `PATCH /api/me/business-details`. Every field is optional —
 * `undefined` = don't touch, explicit `null` = clear. `ValidateIf` lets the
 * string validators apply only when the value isn't null so the explicit-clear
 * path works without bypassing length checks for real strings.
 *
 * `name` is the only non-nullable field (it's also `Organization.name` — never
 * NULL by DB constraint, set at signup). Min length 1 so the owner can't blank
 * it out from the business-details form.
 */
export class UpdateBusinessDetailsDto implements UpdateBusinessDetailsInput {
	@IsOptional()
	@IsString()
	@MinLength(1)
	@MaxLength(COMPANY_NAME_MAX_LENGTH)
	@Matches(NON_WHITESPACE_PATTERN, { message: `name ${NON_WHITESPACE_MESSAGE}` })
	name?: string;

	@ValidateIf((_, value) => value !== null)
	@IsOptional()
	@IsString()
	@MaxLength(COMPANY_REGISTRATION_NUMBER_MAX_LENGTH)
	companyRegistrationNumber?: string | null;

	@ValidateIf((_, value) => value !== null)
	@IsOptional()
	@IsString()
	@MaxLength(COMPANY_VAT_MAX_LENGTH)
	companyVatNumber?: string | null;

	@ValidateIf((_, value) => value !== null)
	@IsOptional()
	@IsString()
	@MaxLength(COMPANY_ADDRESS_MAX_LENGTH)
	companyAddress?: string | null;

	@ValidateIf((_, value) => value !== null)
	@IsOptional()
	@IsString()
	@MaxLength(COMPANY_PHONE_MAX_LENGTH)
	companyPhone?: string | null;

	@ValidateIf((_, value) => value !== null)
	@IsOptional()
	@IsString()
	@MaxLength(COMPANY_WEBSITE_MAX_LENGTH)
	companyWebsite?: string | null;

	@ValidateIf((_, value) => value !== null)
	@IsOptional()
	@IsString()
	@MaxLength(COMPANY_FOOTER_MAX_LENGTH)
	companyFooter?: string | null;

	@IsOptional()
	@IsInt()
	@Min(PAYMENT_TERMS_DAYS_MIN)
	@Max(PAYMENT_TERMS_DAYS_MAX)
	defaultPaymentTermsDays?: number;

	@IsOptional()
	@IsInt()
	@Min(QUOTE_VALIDITY_DAYS_MIN)
	@Max(QUOTE_VALIDITY_DAYS_MAX)
	quoteValidityDays?: number;

	@IsOptional()
	@IsIn(VERTICAL_VALUES)
	vertical?: VerticalValue;
}

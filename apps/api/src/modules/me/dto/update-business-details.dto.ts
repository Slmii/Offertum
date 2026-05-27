import {
	COMPANY_ADDRESS_MAX_LENGTH,
	COMPANY_FOOTER_MAX_LENGTH,
	COMPANY_NAME_MAX_LENGTH,
	COMPANY_REGISTRATION_NUMBER_MAX_LENGTH,
	COMPANY_VAT_MAX_LENGTH,
	PAYMENT_TERMS_DAYS_MAX,
	PAYMENT_TERMS_DAYS_MIN,
	type UpdateBusinessDetailsInput
} from '@quoteom/shared';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';

/**
 * Request body for `PATCH /api/me/business-details`. Every field is optional —
 * `undefined` = don't touch, explicit `null` = clear. `ValidateIf` lets the
 * string validators apply only when the value isn't null so the explicit-clear
 * path works without bypassing length checks for real strings.
 */
export class UpdateBusinessDetailsDto implements UpdateBusinessDetailsInput {
	@ValidateIf((_, value) => value !== null)
	@IsOptional()
	@IsString()
	@MaxLength(COMPANY_NAME_MAX_LENGTH)
	companyName?: string | null;

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
	@MaxLength(COMPANY_FOOTER_MAX_LENGTH)
	companyFooter?: string | null;

	@IsOptional()
	@IsInt()
	@Min(PAYMENT_TERMS_DAYS_MIN)
	@Max(PAYMENT_TERMS_DAYS_MAX)
	defaultPaymentTermsDays?: number;
}

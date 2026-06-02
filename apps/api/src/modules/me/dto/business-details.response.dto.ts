import type { BusinessDetails } from '@offertum/shared';

/**
 * Response for `GET /api/me/business-details` + `PATCH /api/me/business-details`.
 * Asset booleans are derived from storage keys; binaries stream from dedicated
 * logo / letterhead endpoints.
 */
export class BusinessDetailsResponseDto implements BusinessDetails {
	name!: string;
	companyRegistrationNumber!: string | null;
	companyVatNumber!: string | null;
	companyAddress!: string | null;
	companyPhone!: string | null;
	companyWebsite!: string | null;
	companyFooter!: string | null;
	defaultPaymentTermsDays!: number;
	quoteValidityDays!: number;
	hasLogo!: boolean;
	hasLetterhead!: boolean;
}

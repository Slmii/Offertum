import type { BusinessDetails } from '@offertum/shared';

/**
 * Response for `GET /api/me/business-details` + `PATCH /api/me/business-details`.
 * `hasLogo` is the derived boolean — the binary itself streams from a separate
 * endpoint (deferred to the logo-upload follow-up).
 */
export class BusinessDetailsResponseDto implements BusinessDetails {
	companyName!: string | null;
	companyRegistrationNumber!: string | null;
	companyVatNumber!: string | null;
	companyAddress!: string | null;
	companyFooter!: string | null;
	defaultPaymentTermsDays!: number;
	hasLogo!: boolean;
}

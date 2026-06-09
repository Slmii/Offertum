import { VERTICAL_VALUES, type BusinessDetails, type VerticalValue } from '@offertum/shared';
import { ApiProperty } from '@nestjs/swagger';

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

	@ApiProperty({ enum: VERTICAL_VALUES })
	vertical!: VerticalValue;

	hasLogo!: boolean;
	hasLetterhead!: boolean;
}

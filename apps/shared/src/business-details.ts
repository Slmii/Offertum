/**
 * Per-org business-details surface used on quote PDFs (W9.4 onward) + future
 * invoice integrations. `name` here is the same `Organization.name` set at
 * signup — the business-details page is just the second editing surface for it,
 * alongside the country-agnostic registration / VAT / address / footer fields
 * that appear on customer documents. (A previous design split this into a
 * separate `companyName` column; the split was retired 2026-05-28 because the
 * internal label and the legal entity name always matched in practice.)
 *
 * `companyRegistrationNumber` is the country-agnostic field for chamber-of-
 * commerce / trade-register identifiers (NL: KvK, UK: Companies House, DE: HRB,
 * FR: SIREN, BE: KBO/BCE). VAT lives in a separate column because the EU VAT
 * identifier is a distinct legal concept from the registration number.
 */
export interface BusinessDetails {
	/** The org's customer-facing legal name. Required at the schema level
	 * (set at signup, never NULL) but exposed as a string here for symmetry
	 * with the rest of the editable surface. */
	name: string;
	companyRegistrationNumber: string | null;
	companyVatNumber: string | null;
	companyAddress: string | null;
	companyPhone: string | null;
	companyWebsite: string | null;
	companyFooter: string | null;
	defaultPaymentTermsDays: number;
	quoteValidityDays: number;
	/** When set, `GET /api/me/business-details/logo` streams the binary. NULL
	 * means no logo uploaded — the quote PDF falls back to a text-only header. */
	hasLogo: boolean;
	/** When set, the quote PDF can use this as branded letterhead. */
	hasLetterhead: boolean;
}

export interface UpdateBusinessDetailsInput {
	name?: string;
	companyRegistrationNumber?: string | null;
	companyVatNumber?: string | null;
	companyAddress?: string | null;
	companyPhone?: string | null;
	companyWebsite?: string | null;
	companyFooter?: string | null;
	defaultPaymentTermsDays?: number;
	quoteValidityDays?: number;
}

export const COMPANY_NAME_MAX_LENGTH = 200;
export const COMPANY_REGISTRATION_NUMBER_MAX_LENGTH = 32;
export const COMPANY_VAT_MAX_LENGTH = 32;
export const COMPANY_ADDRESS_MAX_LENGTH = 1_000;
export const COMPANY_PHONE_MAX_LENGTH = 64;
export const COMPANY_WEBSITE_MAX_LENGTH = 200;
export const COMPANY_FOOTER_MAX_LENGTH = 2_000;
export const PAYMENT_TERMS_DAYS_MIN = 0;
export const PAYMENT_TERMS_DAYS_MAX = 365;
export const QUOTE_VALIDITY_DAYS_MIN = 1;
export const QUOTE_VALIDITY_DAYS_MAX = 365;

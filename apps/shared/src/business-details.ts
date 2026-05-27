/**
 * Per-org business-details surface used on quote PDFs (W9.4 onward) + future
 * invoice integrations. Distinct from `Organization.name` which is the
 * internal label; `companyName` is the customer-facing legal name printed on
 * documents.
 *
 * All fields are nullable — the quote PDF renders a warning at draft time when
 * required fields are missing but never blocks sending. The owner sets these
 * once on `/settings/business-details`.
 *
 * `companyRegistrationNumber` is the country-agnostic field for chamber-of-
 * commerce / trade-register identifiers (NL: KvK, UK: Companies House, DE: HRB,
 * FR: SIREN, BE: KBO/BCE). VAT lives in a separate column because the EU VAT
 * identifier is a distinct legal concept from the registration number.
 */
export interface BusinessDetails {
	companyName: string | null;
	companyRegistrationNumber: string | null;
	companyVatNumber: string | null;
	companyAddress: string | null;
	companyFooter: string | null;
	defaultPaymentTermsDays: number;
	/** When set, `GET /api/me/business-details/logo` streams the binary. NULL
	 * means no logo uploaded — the quote PDF falls back to a text-only header. */
	hasLogo: boolean;
}

export interface UpdateBusinessDetailsInput {
	companyName?: string | null;
	companyRegistrationNumber?: string | null;
	companyVatNumber?: string | null;
	companyAddress?: string | null;
	companyFooter?: string | null;
	defaultPaymentTermsDays?: number;
}

export const COMPANY_NAME_MAX_LENGTH = 200;
export const COMPANY_REGISTRATION_NUMBER_MAX_LENGTH = 32;
export const COMPANY_VAT_MAX_LENGTH = 32;
export const COMPANY_ADDRESS_MAX_LENGTH = 1_000;
export const COMPANY_FOOTER_MAX_LENGTH = 2_000;
export const PAYMENT_TERMS_DAYS_MIN = 0;
export const PAYMENT_TERMS_DAYS_MAX = 365;

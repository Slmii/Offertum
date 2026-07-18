export const VERTICAL_VALUES = [
	'LOODGIETER',
	'ELEKTRICIEN',
	'SCHILDER',
	'TIMMERMAN',
	'DAKDEKKER',
	'TEGELZETTER',
	'HOVENIER',
	'INSTALLATEUR',
	'SCHOONMAAK',
	'OVERIG'
] as const;

export type VerticalValue = (typeof VERTICAL_VALUES)[number];

export const SUPPORTED_LANGUAGE_VALUES = ['nl', 'en'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGE_VALUES)[number];
export const SUPPORTED_LANGUAGES: { value: SupportedLanguage; label: string; disabled?: boolean }[] = [
	{ value: 'nl', label: 'Nederlands' }
	// { value: 'en', label: 'English', disabled: true } // TODO: enable when translation is ready
];
export const DEFAULT_LANGUAGE: SupportedLanguage = 'nl';

export const SUPPORTED_TIMEZONE_VALUES = [
	'Europe/Amsterdam'
	// 'Europe/Brussels',
	// 'Europe/Paris',
	// 'Europe/Berlin',
	// 'Europe/London',
	// 'Europe/Madrid',
	// 'UTC'
] as const;
export type SupportedTimezone = (typeof SUPPORTED_TIMEZONE_VALUES)[number];
export const SUPPORTED_TIMEZONES: { value: SupportedTimezone; label: string }[] = [
	{ value: 'Europe/Amsterdam', label: 'Amsterdam (CET/CEST)' }
	// { value: 'Europe/Brussels', label: 'Brussel (CET/CEST)' },
	// { value: 'Europe/Paris', label: 'Parijs (CET/CEST)' },
	// { value: 'Europe/Berlin', label: 'Berlijn (CET/CEST)' },
	// { value: 'Europe/London', label: 'Londen (GMT/BST)' },
	// { value: 'Europe/Madrid', label: 'Madrid (CET/CEST)' },
	// { value: 'UTC', label: 'UTC' }
];
export const DEFAULT_TIMEZONE: SupportedTimezone = 'Europe/Amsterdam';

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
	vertical: VerticalValue;
	language: string;
	timezone: string;
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
	vertical?: VerticalValue;
	language?: string;
	timezone?: string;
}

/** Result of purging all ingested email data for an organization (owner-only danger action). */
export interface PurgeIngestedDataResult {
	deletedOpportunities: number;
	deletedRawMessages: number;
	deletedNotifications: number;
}

export const COMPANY_NAME_MAX_LENGTH = 200;
export const COMPANY_REGISTRATION_NUMBER_MAX_LENGTH = 32;
export const COMPANY_VAT_MAX_LENGTH = 32;

/**
 * Format validators for the NL-labelled identity fields on the Organisatie page. Shared so the web
 * zod schema and the API DTO stay in lockstep. All are lenient on surrounding case/whitespace and
 * strict on the internal shape; empty is handled by the callers (the fields are optional).
 *
 * - KvK: exactly 8 digits.
 * - BTW (NL VAT): `NL` + 9 digits + `B` + 2 digits, e.g. `NL123456789B01` (case-insensitive).
 * - Website: an optional `http(s)://`, a dotted host with a ≥2-char TLD, and an optional path.
 */
export const KVK_NUMBER_REGEX = /^\d{8}$/;
export const NL_VAT_NUMBER_REGEX = /^NL[0-9]{9}B[0-9]{2}$/i;
export const WEBSITE_REGEX = /^(https?:\/\/)?([a-z0-9](-?[a-z0-9])*\.)+[a-z]{2,}(\/\S*)?$/i;

export function isValidKvkNumber(value: string): boolean {
	return KVK_NUMBER_REGEX.test(value.trim());
}

export function isValidNlVatNumber(value: string): boolean {
	return NL_VAT_NUMBER_REGEX.test(value.trim());
}

export function isValidWebsite(value: string): boolean {
	return WEBSITE_REGEX.test(value.trim());
}

/** Canonical storage form of an NL VAT number: trimmed + uppercased (`nl123..b01` → `NL123..B01`). */
export function normalizeNlVatNumber(value: string): string {
	return value.trim().toUpperCase();
}

export const COMPANY_ADDRESS_MAX_LENGTH = 1_000;
export const COMPANY_PHONE_MAX_LENGTH = 64;
export const COMPANY_WEBSITE_MAX_LENGTH = 200;
export const COMPANY_FOOTER_MAX_LENGTH = 2_000;
export const PAYMENT_TERMS_DAYS_MIN = 0;
export const PAYMENT_TERMS_DAYS_MAX = 365;
export const QUOTE_VALIDITY_DAYS_MIN = 1;
export const QUOTE_VALIDITY_DAYS_MAX = 365;

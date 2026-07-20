import type { CatalogItemUnit, QuoteDiscountInput } from '@offertum/shared';

export interface QuotePdfBusinessDetails {
	name: string;
	companyRegistrationNumber: string | null;
	companyVatNumber: string | null;
	companyAddress: string | null;
	companyPhone: string | null;
	companyWebsite: string | null;
	companyFooter: string | null;
	defaultPaymentTermsDays: number;
	hasLogo: boolean;
	hasLetterhead: boolean;
}

export interface QuotePdfLineItem {
	description: string;
	unit: CatalogItemUnit;
	unitPriceEur: string;
	quantity: number;
	vatRate: number;
	/** BTW verlegd (reverse charge): the line's net counts but it carries €0 VAT and
	 * prints "verlegd" in the BTW column. */
	vatReverseCharged: boolean;
	/** Order-level pricing-rule adjustment (Spoedtoeslag / Voorrijkosten / Korting /
	 * Minimumordertoeslag). Rendered in the totals block below the work subtotal, not among the
	 * "Werkzaamheden" rows — it surcharges the subtotal, it isn't part of it. Still counts toward VAT
	 * + grand total. Derived via `isOrderLevelAdjustmentLine` where the line is assembled. */
	isAdjustment: boolean;
}

export interface QuotePdfRenderInput {
	quoteNumber: string;
	issueDate: Date;
	validUntil: Date;
	customerName: string;
	customerEmail: string | null;
	customerAddress: string | null;
	businessDetails: QuotePdfBusinessDetails;
	lineItems: QuotePdfLineItem[];
	/** Owner-applied quote-level discount, printed in the totals block. `null` = none. */
	discount?: QuoteDiscountInput | null;
	logoDataUri?: string | null;
	letterheadDataUri?: string | null;
}

export interface QuotePdfLineTotals {
	netCents: number;
	vatCents: number;
	grossCents: number;
}

export interface QuotePdfTotals {
	netCents: number;
	vatCents: number;
	grossCents: number;
}

import type { CatalogItemUnit } from '@offertum/shared';

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

import type { QuoteLineSource } from './quote-line-items.js';

/** Workflow state of a persisted quote draft (W10.2). */
export type QuoteDraftStatus = 'draft' | 'sent';

/** Allowed Dutch BTW rates. `verlegd` (reverse charge) is a separate boolean. */
export const QUOTE_VAT_RATES = [0, 9, 21] as const;
export type QuoteVatRate = (typeof QUOTE_VAT_RATES)[number];

export const QUOTE_LINE_DESCRIPTION_MAX_LENGTH = 1000;

/**
 * A single persisted line on a quote draft. Price/name/unit/VAT are denormalized
 * off the originating catalog item / pricing rule so source-row deletes never break
 * quote history. `unitPriceEur` is a decimal string (or `null` for an inferred line
 * awaiting an owner price).
 */
export interface QuoteLineItem {
	id: string;
	/** 0-based display order on the quote. */
	position: number;
	description: string;
	unit: string;
	/** Decimal string, e.g. "4.00". */
	quantity: string;
	unitPriceEur: string | null;
	vatRate: number;
	/** BTW verlegd (reverse charge): net counts toward the subtotal, VAT is €0. */
	vatReverseCharged: boolean;
	source: QuoteLineSource;
	/** Flips true on first owner edit (W10.3) — the year-2 AI-accuracy signal. */
	wasEditedByUser: boolean;
	/** Set when `source === 'catalog_match'`. */
	catalogItemId: string | null;
	/** Set when `source === 'rule_applied'`. */
	appliedRuleId: string | null;
	note: string | null;
}

/** A persisted quote draft with its line items (newest-first on the opportunity). */
export interface QuoteDraft {
	id: string;
	opportunityId: string;
	status: QuoteDraftStatus;
	lineItems: QuoteLineItem[];
	createdAt: string;
	updatedAt: string;
	sentAt: string | null;
}

/** `GET /api/opportunities/:id/quote-drafts` response. */
export interface QuoteDraftListResponse {
	drafts: QuoteDraft[];
}

/**
 * `POST /api/quote-drafts/:id/line-items` — add an owner-authored line. `unit`
 * defaults to "piece" server-side when omitted. Prices/quantities are decimal
 * strings (precision over JSON).
 */
export interface CreateQuoteLineItemInput {
	description: string;
	quantity: string;
	unitPriceEur: string | null;
	vatRate: number;
	vatReverseCharged: boolean;
	unit?: string;
}

/**
 * `PATCH /api/quote-drafts/:id/line-items/:lineId` — every field optional; only
 * the supplied ones change. Any edit flips the line's `wasEditedByUser` to true.
 */
export interface UpdateQuoteLineItemInput {
	description?: string;
	quantity?: string;
	unitPriceEur?: string | null;
	vatRate?: number;
	vatReverseCharged?: boolean;
	unit?: string;
	position?: number;
}

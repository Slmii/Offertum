import type { QuoteLineSource } from './quote-line-items.js';

/** Workflow state of a persisted quote draft (W10.2). */
export type QuoteDraftStatus = 'draft' | 'sent';

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

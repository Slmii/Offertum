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
	// Quote validity deadline ("Geldig tot"), stamped at creation. Null only for drafts
	// created before this field existed.
	validUntil: string | null;
}

/** A generated quote PDF version (W10.4). The binary is fetched via the download
 * endpoint; this is just the history-list metadata. */
export interface QuotePdf {
	id: string;
	opportunityId: string;
	quoteDraftId: string | null;
	filename: string;
	sizeBytes: number;
	/** Quote total incl. btw (cents) snapshotted when the PDF was generated. Null for older PDFs. */
	totalCents: number | null;
	createdAt: string;
}

/** `GET /api/opportunities/:id/quote-drafts` response. */
export interface QuoteDraftListResponse {
	drafts: QuoteDraft[];
	/** Generated PDF versions for the opportunity, newest-first. */
	pdfs: QuotePdf[];
	/** Most recent moment the org's pricing changed (playbook recompiled or a rule
	 * edited). Compare against a draft's `updatedAt` (which bumps when its lines are
	 * (re)generated) to know whether its pricing is stale. `null` when the org has no
	 * playbook yet. */
	pricingUpdatedAt: string | null;
}

/**
 * One line for a full draft replacement (`PUT …/line-items`). Carries the complete
 * denormalized shape — used when regenerating: the owner picks which current + newly
 * proposed lines survive, and the chosen set replaces the draft's lines wholesale.
 */
export interface ReplaceQuoteLineInput {
	description: string;
	unit: string;
	quantity: string;
	unitPriceEur: string | null;
	vatRate: number;
	vatReverseCharged: boolean;
	source: QuoteLineSource;
	wasEditedByUser: boolean;
	catalogItemId: string | null;
	appliedRuleId: string | null;
	note: string | null;
}

/** `PUT /api/quote-drafts/:id/line-items` — replace all lines on the draft. */
export interface ReplaceQuoteLinesInput {
	lines: ReplaceQuoteLineInput[];
}

/** `POST /api/opportunities/:id/reply-draft/quote-pdf` — attach one PDF version to
 * the reply draft (replacing any previously attached version), or detach with `null`. */
export interface AttachQuotePdfInput {
	quotePdfId: string | null;
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

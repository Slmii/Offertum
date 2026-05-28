import type { CatalogItemUnit } from './catalog-items.js';

/**
 * Where a proposed quote line came from. Drives provenance display in the edit
 * UI (W10.3) + the AI-accuracy metric (W14c quote-line-item retention).
 *  - `catalog_match` : the AI matched the request to a catalog item; price + VAT
 *                      come deterministically from that catalog row.
 *  - `rule_applied`  : the line was produced by a firing `PricingRule` (hourly
 *                      rate priced an inferred labor line, or an opp-wide
 *                      surcharge / travel / discount / minimum-order line). The
 *                      number is engine-computed, never AI-invented.
 *  - `inferred`      : the AI proposed work it couldn't map to the catalog or a
 *                      rule. Description + quantity are the model's; the price is
 *                      `null` and the owner must set it (flagged in the UI).
 */
export const QUOTE_LINE_SOURCES = ['catalog_match', 'rule_applied', 'inferred'] as const;
export type QuoteLineSource = (typeof QUOTE_LINE_SOURCES)[number];

/**
 * A single proposed line on a draft quote. Output of the W10.1 line-item
 * proposer. `unitPriceEur` is a decimal string (preserves precision over JSON,
 * matches the catalog wire format) or `null` when the price is unknown
 * (`inferred` lines awaiting an owner price).
 */
export interface ProposedQuoteLine {
	description: string;
	unit: CatalogItemUnit;
	quantity: number;
	unitPriceEur: string | null;
	vatRate: number;
	source: QuoteLineSource;
	/** Set when `source === 'catalog_match'` — the matched CatalogItem id. */
	catalogItemId: string | null;
	/** Set when `source === 'rule_applied'` — the firing PricingRule id, so the
	 * UI (W11.7) can surface which rule produced the line. */
	appliedRuleId: string | null;
	/** Human-readable provenance note (the rule description, or "stel prijs in"
	 * for inferred lines). `null` when no note applies. */
	note: string | null;
}

/** `POST /api/opportunities/:id/quote-line-items/preview` response. */
export interface ProposeQuoteLinesResponse {
	lines: ProposedQuoteLine[];
}

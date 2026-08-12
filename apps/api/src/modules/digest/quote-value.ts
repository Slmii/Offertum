import {
	computeQuoteTotals,
	isOrderLevelAdjustmentLine,
	isPricingEffectType,
	lineNetCents,
	type PricingEffectType,
	type QuoteDiscountInput,
	type QuoteLineSource,
	type QuoteTotalLineInput
} from '@offertum/shared';

// A rankable quote line — the subset of QuoteLineItem fields the value math needs. Decimal
// columns arrive as strings (Prisma serialization), matching shared's input shape. Includes
// `source`/`ruleEffectType` so `isOrderLevelAdjustmentLine` can exclude subtotal modifiers
// (surcharge/discount/minimum) from the discount's percent base, same as the editor + PDF.
export type QuoteValueLine = QuoteTotalLineInput & {
	source: QuoteLineSource;
	ruleEffectType: PricingEffectType | string | null;
};

/**
 * Net (ex-VAT) euro value of a quote's lines — the business's revenue, the honest
 * "what this deal is worth to me" figure for ranking. Delegates the integer-cents math
 * to the shared computeQuoteTotals so the number agrees with the PDF + live editor,
 * including the quote-level discount (percent base = the work-only subtotal, matching
 * `QuotePanel` / `quote-drafts.service.ts`).
 */
export function quoteNetEuros(lines: readonly QuoteValueLine[], discount?: QuoteDiscountInput | null): number {
	const workNetCents = lines
		.filter(line => !isOrderLevelAdjustmentLine({ source: line.source, ruleEffectType: normalizeRuleEffectType(line.ruleEffectType) }))
		.reduce((sum, line) => sum + lineNetCents(line), 0);

	return computeQuoteTotals(lines, discount, workNetCents).netCents / 100;
}

function normalizeRuleEffectType(value: PricingEffectType | string | null): PricingEffectType | null {
	return isPricingEffectType(value) ? value : null;
}

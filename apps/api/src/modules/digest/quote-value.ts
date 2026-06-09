import { computeQuoteTotals, type QuoteTotalLineInput } from '@offertum/shared';

// A rankable quote line — the subset of QuoteLineItem fields the value math needs.
// Decimal columns arrive as strings (Prisma serialization), matching shared's input shape.
export type QuoteValueLine = QuoteTotalLineInput;

/**
 * Net (ex-VAT) euro value of a quote's lines — the business's revenue, the honest
 * "what this deal is worth to me" figure for ranking. Delegates the integer-cents math
 * to the shared computeQuoteTotals so the number agrees with the PDF + live editor.
 */
export function quoteNetEuros(lines: readonly QuoteValueLine[]): number {
	return computeQuoteTotals(lines).netCents / 100;
}

/**
 * Deterministic quote-total math (W10.3). Pure + integer-cents to avoid float drift
 * — a wrong number on a quote is a real-world liability. Shared so the live editor
 * (web), the API, and the PDF (W10.4) all compute totals identically.
 *
 * Per-BTW-bracket subtotals: lines are grouped by their VAT treatment. A
 * reverse-charge line (`vatReverseCharged`) forms a separate "verlegd" bracket that
 * contributes its net but €0 VAT. Lines without a price yet (`unitPriceEur === null`)
 * are excluded from the money totals and counted in `unpricedLineCount` so the UI can
 * warn the owner the quote is incomplete.
 */

export interface QuoteTotalLineInput {
	quantity: string;
	unitPriceEur: string | null;
	vatRate: number;
	vatReverseCharged: boolean;
}

export interface QuoteVatBracketTotal {
	/** Stable grouping key: 'verlegd' for reverse-charge, else the rate ("0"/"9"/"21"). */
	key: string;
	/** Effective VAT rate for the bracket; always 0 when `reverseCharged`. */
	vatRate: number;
	reverseCharged: boolean;
	netCents: number;
	vatCents: number;
}

export interface QuoteTotals {
	/** Sorted: numeric rates ascending, then the verlegd bracket last. */
	brackets: QuoteVatBracketTotal[];
	netCents: number;
	vatCents: number;
	grossCents: number;
	unpricedLineCount: number;
}

/** Cents of a single priced line's net amount (matches the W9.4 PDF rounding). */
export function lineNetCents(line: QuoteTotalLineInput): number {
	if (line.unitPriceEur === null) {
		return 0;
	}
	const unitCents = Math.round(Number(line.unitPriceEur) * 100);
	return Math.round(unitCents * Number(line.quantity));
}

export function computeQuoteTotals(lines: readonly QuoteTotalLineInput[]): QuoteTotals {
	const byKey = new Map<string, QuoteVatBracketTotal>();
	let unpricedLineCount = 0;

	for (const line of lines) {
		if (line.unitPriceEur === null) {
			unpricedLineCount += 1;
			continue;
		}

		const key = line.vatReverseCharged ? 'verlegd' : String(line.vatRate);
		const netCents = lineNetCents(line);
		const vatCents = line.vatReverseCharged ? 0 : Math.round((netCents * line.vatRate) / 100);

		const bracket = byKey.get(key);
		if (bracket) {
			bracket.netCents += netCents;
			bracket.vatCents += vatCents;
		} else {
			byKey.set(key, {
				key,
				vatRate: line.vatReverseCharged ? 0 : line.vatRate,
				reverseCharged: line.vatReverseCharged,
				netCents,
				vatCents
			});
		}
	}

	const brackets = [...byKey.values()].sort(compareBrackets);
	const netCents = brackets.reduce((sum, bracket) => sum + bracket.netCents, 0);
	const vatCents = brackets.reduce((sum, bracket) => sum + bracket.vatCents, 0);

	return { brackets, netCents, vatCents, grossCents: netCents + vatCents, unpricedLineCount };
}

/** Numeric rates ascending; the verlegd bracket always sorts last. */
function compareBrackets(a: QuoteVatBracketTotal, b: QuoteVatBracketTotal): number {
	if (a.reverseCharged !== b.reverseCharged) {
		return a.reverseCharged ? 1 : -1;
	}
	return a.vatRate - b.vatRate;
}

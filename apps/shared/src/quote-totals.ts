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

import type { PricingEffectType } from './pricing-playbook.js';
import type { QuoteLineSource } from './quote-line-items.js';

export interface QuoteTotalLineInput {
	quantity: string;
	unitPriceEur: string | null;
	vatRate: number;
	vatReverseCharged: boolean;
}

/**
 * Pricing effects that MODIFY the subtotal — percentage surcharges, discounts, and the minimum-order
 * top-up. Lines from these belong in the totals block (below the subtotal), because their amount is a
 * function of the order total (or is conceptually a discount on it). Everything else a rule can
 * produce is a concrete COST — an hourly-rate work line (`rate_eur_per_hour`) or a fixed/ per-km
 * travel fee (`flat_fee_eur` / `per_km_eur`) — and stays in the line-item table like any other line.
 */
const TOTALS_MODIFIER_EFFECTS: ReadonlySet<PricingEffectType> = new Set<PricingEffectType>([
	'surcharge_percent',
	'discount_percent',
	'discount_eur',
	'minimum_eur'
]);

/**
 * True for an ORDER-LEVEL subtotal modifier — a percentage surcharge (Spoedtoeslag), a discount
 * (Korting), or a minimum-order top-up. These render in the totals block, NOT interleaved with the
 * work rows, because they modify the subtotal rather than being part of it. Fixed COSTS a rule
 * produces — travel (`per_km_eur` / `flat_fee_eur`) and hourly work (`rate_eur_per_hour`) — are
 * concrete line items and stay in the table. Classification is authoritative via the persisted
 * `ruleEffectType` (set by the resolver), not re-derived from unit/description. Modifiers STILL count
 * toward `computeQuoteTotals` (VAT + grand total run over every line); only placement differs.
 */
export function isOrderLevelAdjustmentLine(line: {
	source: QuoteLineSource;
	ruleEffectType: PricingEffectType | null;
}): boolean {
	return line.source === 'rule_applied' && line.ruleEffectType !== null && TOTALS_MODIFIER_EFFECTS.has(line.ruleEffectType);
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

/** Owner-applied quote-level discount. `percent` = `value` is 0–100 (% of the pre-discount net);
 * `eur` = `value` is a euro amount taken off the net. */
export interface QuoteDiscountInput {
	type: 'percent' | 'eur';
	value: number;
}

export interface QuoteTotals {
	/** Sorted: numeric rates ascending, then the verlegd bracket last. Nets/VAT are POST-discount. */
	brackets: QuoteVatBracketTotal[];
	netCents: number;
	/** Quote-level discount actually deducted, in cents (0 when none). Already reflected in
	 * `netCents` / `vatCents` / `grossCents` and the per-bracket nets. */
	discountCents: number;
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

export function computeQuoteTotals(
	lines: readonly QuoteTotalLineInput[],
	discount?: QuoteDiscountInput | null,
	// Base a PERCENT discount is taken from (in cents) — the work subtotal, so "Korting 10%" reads as
	// 10% of the displayed Subtotaal and surcharges aren't discounted. Defaults to the full pre-discount
	// net when omitted. A euro discount ignores this (it's a flat amount). Both are capped so the
	// grand total never goes below €0.
	discountBaseCents?: number
): QuoteTotals {
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
	const preDiscountNet = brackets.reduce((sum, bracket) => sum + bracket.netCents, 0);

	// A quote-level discount reduces the net; VAT is then recomputed on the DISCOUNTED net, apportioned
	// across the rate brackets by net weight (so a 10% discount on a mixed 9%/21% quote lowers each
	// bracket's VAT proportionally). Apportioned in integer cents with the rounding remainder handed to
	// the largest-net bracket, so the per-bracket deductions sum EXACTLY to `discountCents`.
	const discountCents = resolveDiscountCents(discount, discountBaseCents ?? preDiscountNet, preDiscountNet);
	if (discountCents > 0) {
		applyDiscountToBrackets(brackets, discountCents);
	}

	const netCents = brackets.reduce((sum, bracket) => sum + bracket.netCents, 0);
	const vatCents = brackets.reduce((sum, bracket) => sum + bracket.vatCents, 0);

	return { brackets, netCents, discountCents, vatCents, grossCents: netCents + vatCents, unpricedLineCount };
}

/** Resolve the discount to a cents amount, clamped to `[0, preDiscountNet]` (can't discount below €0
 * or apply a discount when there's nothing priced yet). */
function resolveDiscountCents(
	discount: QuoteDiscountInput | null | undefined,
	percentBaseCents: number,
	capCents: number
): number {
	if (!discount || capCents <= 0 || !Number.isFinite(discount.value) || discount.value <= 0) {
		return 0;
	}
	const raw =
		discount.type === 'percent'
			? Math.round((Math.max(0, percentBaseCents) * clamp(discount.value, 0, 100)) / 100)
			: Math.round(discount.value * 100);
	// Cap at the full net so the grand total never goes below €0, even if the percent base > net.
	return Math.max(0, Math.min(raw, capCents));
}

/** Deduct `discountCents` from the brackets' nets proportionally + recompute each bracket's VAT. */
function applyDiscountToBrackets(brackets: QuoteVatBracketTotal[], discountCents: number): void {
	// Apportion ONLY across positive-net brackets — the taxable bases a discount can reduce. A bracket
	// can be NET-NEGATIVE when it holds a rule-applied "Korting" line (a negative-priced line stamped
	// at 21%); that bracket is itself a discount, so the manual discount applies on top of the positive
	// bases, never "absorbed" by a negative bracket. `discountCents ≤ preDiscountNet ≤ Σ(positive nets)`
	// (negatives only lower preDiscountNet), so it always allocates fully without a bracket crossing 0.
	const positive = brackets.filter(bracket => bracket.netCents > 0);
	const positiveNet = positive.reduce((sum, bracket) => sum + bracket.netCents, 0);
	if (positiveNet <= 0) {
		return;
	}
	// Proportional floor per bracket, then hand each leftover cent to the largest-net brackets (they
	// always have the room), so the per-bracket deductions sum EXACTLY to `discountCents`.
	const entries = positive.map(bracket => ({
		bracket,
		share: Math.floor((discountCents * bracket.netCents) / positiveNet)
	}));
	let leftover = discountCents - entries.reduce((sum, entry) => sum + entry.share, 0);
	for (const entry of [...entries].sort((a, b) => b.bracket.netCents - a.bracket.netCents)) {
		if (leftover <= 0) {
			break;
		}
		entry.share += 1;
		leftover -= 1;
	}
	for (const entry of entries) {
		const applied = Math.min(entry.share, entry.bracket.netCents);
		entry.bracket.netCents -= applied;
		entry.bracket.vatCents = entry.bracket.reverseCharged
			? 0
			: Math.round((entry.bracket.netCents * entry.bracket.vatRate) / 100);
	}
}

function clamp(value: number, lo: number, hi: number): number {
	return Math.min(Math.max(value, lo), hi);
}

/** Numeric rates ascending; the verlegd bracket always sorts last. */
function compareBrackets(a: QuoteVatBracketTotal, b: QuoteVatBracketTotal): number {
	if (a.reverseCharged !== b.reverseCharged) {
		return a.reverseCharged ? 1 : -1;
	}
	return a.vatRate - b.vatRate;
}

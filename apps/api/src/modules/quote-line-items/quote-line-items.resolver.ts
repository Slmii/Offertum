import type { CatalogItemUnit, ProposedQuoteLine } from '@offertum/shared';
import { type EvaluableRule, evaluateRules } from '@/modules/pricing-playbook/rule-engine';
import type { LineItemProposal } from '@/modules/ai/line-item-proposer/line-item-proposer.types';

/**
 * Engine-price layer of W10.1. Takes the LLM's match decisions (which catalog
 * refs + quantities, plus non-catalog work) and produces fully-priced
 * `ProposedQuoteLine`s where EVERY number is deterministic:
 *  - catalog lines → price + VAT from the catalog row (never AI-invented).
 *  - inferred labor lines → priced from a firing HOURLY_RATE rule when one exists
 *    (then `source` becomes `rule_applied`); otherwise left unpriced for the owner.
 *  - opp-wide rules (urgency surcharge, travel flat-fee, discount, minimum-order)
 *    → appended as `rule_applied` lines computed off the net subtotal.
 *  - VAT-rate rules override a line's VAT.
 *
 * Pure function: no DI, no IO. The orchestrating service loads the catalog +
 * rules and feeds them in; this stays unit-testable in milliseconds.
 *
 * Deliberately out of scope for the first cut (W11.6 quote-pricing integration):
 * per-km travel (needs a distance), material-markup on already-priced catalog
 * rows, and category-specific rule matching (needs opp→category resolution). The
 * resolver passes `category: null` so only category-agnostic + urgency-keyed
 * rules fire today.
 */

/** Catalog row shape the resolver needs (subset of the full CatalogItemRow). */
export interface ResolverCatalogEntry {
	id: string;
	name: string;
	unit: CatalogItemUnit;
	/** Decimal string, e.g. "85.00". */
	unitPriceEur: string;
	vatRate: number;
}

export interface ResolveQuoteLinesInput {
	proposal: LineItemProposal;
	/** Catalog indexed by the short ref the proposer echoed back (`C1`…). */
	catalogByRef: ReadonlyMap<string, ResolverCatalogEntry>;
	/** Active pricing rules for the org's playbook. */
	rules: ReadonlyArray<EvaluableRule>;
	/** Opportunity-level context for the rule engine. */
	urgency: 'emergency' | 'high' | 'normal' | 'low' | null;
}

/** NL standard VAT, used as the fallback for inferred + computed lines when no
 * VAT rule overrides. */
const DEFAULT_VAT_RATE = 21;
/** Units we treat as labor for hourly-rate pricing + the labor/material split. */
const LABOR_UNITS: ReadonlySet<CatalogItemUnit> = new Set<CatalogItemUnit>(['hour', 'day']);

export function resolveQuoteLines(input: ResolveQuoteLinesInput): ProposedQuoteLine[] {
	const lines: ProposedQuoteLine[] = [];

	// 1. Catalog matches → priced from the catalog row. Unknown refs (model
	//    hallucinated a ref not in the catalog) are dropped.
	for (const catalogLine of input.proposal.catalogLines) {
		const item = input.catalogByRef.get(catalogLine.ref);
		if (!item) {
			continue;
		}
		const lineKind = LABOR_UNITS.has(item.unit) ? 'labor' : 'material';
		lines.push({
			description: item.name,
			unit: item.unit,
			quantity: catalogLine.quantity,
			unitPriceEur: item.unitPriceEur,
			vatRate: resolveVatRate(input.rules, input.urgency, lineKind, item.vatRate),
			source: 'catalog_match',
			catalogItemId: item.id,
			appliedRuleId: null,
			note: null
		});
	}

	// 2. Inferred (non-catalog) work. Labor lines get priced by a firing
	//    HOURLY_RATE rule when one applies; everything else stays unpriced.
	for (const inferred of input.proposal.inferredLines) {
		const lineKind = inferred.lineKind ?? (LABOR_UNITS.has(inferred.unit) ? 'labor' : 'material');
		const hourlyRule =
			lineKind === 'labor' && inferred.unit === 'hour'
				? findRule(input.rules, input.urgency, 'labor', 'HOURLY_RATE', 'rate_eur_per_hour')
				: null;

		lines.push({
			description: inferred.description,
			unit: inferred.unit,
			quantity: inferred.quantity,
			unitPriceEur: hourlyRule ? formatCents(toCents(String(hourlyRule.value))) : null,
			vatRate: resolveVatRate(input.rules, input.urgency, lineKind, DEFAULT_VAT_RATE),
			source: hourlyRule ? 'rule_applied' : 'inferred',
			catalogItemId: null,
			appliedRuleId: hourlyRule?.ruleId ?? null,
			note: hourlyRule?.description ?? (hourlyRule ? null : 'Stel een prijs in')
		});
	}

	// 3. Opp-wide rule lines, computed off the net subtotal of priced lines.
	const netSubtotalCents = lines.reduce((sum, line) => sum + lineNetCents(line), 0);
	lines.push(...buildOppWideRuleLines(input.rules, input.urgency, netSubtotalCents));

	return lines;
}

/** Net (excl. VAT) cents for a priced line; 0 for unpriced (inferred) lines. */
function lineNetCents(line: ProposedQuoteLine): number {
	if (line.unitPriceEur === null) {
		return 0;
	}
	return Math.round(toCents(line.unitPriceEur) * line.quantity);
}

/** Opp-wide surcharge / travel / discount / minimum-order lines. */
function buildOppWideRuleLines(
	rules: ReadonlyArray<EvaluableRule>,
	urgency: ResolveQuoteLinesInput['urgency'],
	netSubtotalCents: number
): ProposedQuoteLine[] {
	const out: ProposedQuoteLine[] = [];
	// Running total of the FULL order. Surcharge + travel − discount all count toward
	// the minimum-order check so it measures the whole bill, not just the base work
	// (otherwise a job already well above the minimum still gets a pointless top-up).
	let orderCents = netSubtotalCents;

	const urgencyRule = findRule(rules, urgency, null, 'URGENCY', 'surcharge_percent');
	if (urgencyRule) {
		const surchargeCents = Math.round((netSubtotalCents * urgencyRule.value) / 100);
		if (surchargeCents !== 0) {
			out.push(ruleLine('Spoedtoeslag', surchargeCents, urgencyRule));
			orderCents += surchargeCents;
		}
	}

	const travelRule = findRule(rules, urgency, null, 'TRAVEL', 'flat_fee_eur');
	if (travelRule) {
		const travelCents = toCents(String(travelRule.value));
		out.push(ruleLine('Voorrijkosten', travelCents, travelRule));
		orderCents += travelCents;
	}

	const discountRule =
		findRule(rules, urgency, null, 'DISCOUNT', 'discount_percent') ??
		findRule(rules, urgency, null, 'DISCOUNT', 'discount_eur');
	if (discountRule) {
		const discountCents =
			discountRule.effectType === 'discount_percent'
				? Math.round((netSubtotalCents * discountRule.value) / 100)
				: toCents(String(discountRule.value));
		if (discountCents !== 0) {
			const applied = Math.abs(discountCents);
			out.push(ruleLine('Korting', -applied, discountRule));
			orderCents -= applied;
		}
	}

	const minimumRule = findRule(rules, urgency, null, 'MINIMUM_ORDER', 'minimum_eur');
	if (minimumRule) {
		const minimumCents = toCents(String(minimumRule.value));
		if (orderCents > 0 && orderCents < minimumCents) {
			out.push(ruleLine('Minimumordertoeslag', minimumCents - orderCents, minimumRule));
		}
	}

	return out;
}

function ruleLine(description: string, netCents: number, rule: MatchedRule): ProposedQuoteLine {
	return {
		description,
		unit: 'flat_fee',
		quantity: 1,
		unitPriceEur: formatCents(netCents),
		vatRate: DEFAULT_VAT_RATE,
		source: 'rule_applied',
		catalogItemId: null,
		appliedRuleId: rule.ruleId,
		note: rule.description
	};
}

/** A rule matched by `findRule`, flattened to the fields the resolver consumes. */
interface MatchedRule {
	ruleId: string;
	ruleType: string;
	effectType: string;
	value: number;
	description: string;
}

/**
 * Run the engine for a (lineKind) context and return the winning rule of
 * `ruleType` IF its effect discriminator matches `effectType` and carries a
 * numeric value. Returns `null` otherwise.
 */
function findRule(
	rules: ReadonlyArray<EvaluableRule>,
	urgency: ResolveQuoteLinesInput['urgency'],
	lineKind: 'labor' | 'material' | null,
	ruleType: string,
	effectType: string
): MatchedRule | null {
	const applied = evaluateRules(rules, { category: null, urgency, jurisdiction: null, lineKind });
	const match = applied.find(rule => rule.ruleType === ruleType);
	if (!match) {
		return null;
	}
	const effect = match.effect as { type?: unknown; value?: unknown };
	if (effect.type !== effectType || typeof effect.value !== 'number') {
		return null;
	}
	return {
		ruleId: match.ruleId,
		ruleType: match.ruleType,
		effectType,
		value: effect.value,
		description: match.description
	};
}

/** Resolve the VAT rate for a line: a firing VAT rule (effect `vat_rate`)
 * overrides the supplied default. */
function resolveVatRate(
	rules: ReadonlyArray<EvaluableRule>,
	urgency: ResolveQuoteLinesInput['urgency'],
	lineKind: 'labor' | 'material' | null,
	fallback: number
): number {
	const vatRule = findRule(rules, urgency, lineKind, 'VAT', 'vat_rate');
	return vatRule ? vatRule.value : fallback;
}

function toCents(value: string): number {
	return Math.round(Number(value) * 100);
}

function formatCents(cents: number): string {
	return (cents / 100).toFixed(2);
}

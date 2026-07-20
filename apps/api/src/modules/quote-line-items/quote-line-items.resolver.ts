import type { CatalogItemUnit, PricingEffectType, ProposedQuoteLine } from '@offertum/shared';
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
 * Per-km travel is priced when `travelOneWayKm` is supplied (geocoded org→customer distance).
 * `jurisdiction` is fixed to NL (the app is Dutch-only for MVP), so NL-scoped rules match. Inferred
 * labor lines carry a `category` tag from the proposer, so category-scoped hourly rates (e.g. a
 * plumbing-only €85/uur) fire per line. Opp-wide rules (urgency/travel/discount/minimum) ignore the
 * per-line `category`/`lineKind` dimensions entirely. Still out of scope: material-markup on
 * already-priced catalog rows.
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
	/** One-way straight-line (geocoded) distance in km from the org's base address to the customer, for
	 * per-km travel rules — the raw distance, no road-detour factor. `undefined` when either address is
	 * missing or couldn't be geocoded — per-km travel is then skipped. */
	travelOneWayKm?: number;
}

/** NL standard VAT, used as the fallback for inferred + computed lines when no
 * VAT rule overrides. */
const DEFAULT_VAT_RATE = 21;
/** The app is Dutch-only for MVP, so every quote is in the NL jurisdiction. The compiler routinely
 * stamps `jurisdiction: "NL"` on rules; passing this (rather than `null`) lets those rules match.
 * When per-customer country resolution lands, derive this from the customer instead. */
const RESOLVER_JURISDICTION = 'NL';
/** Units we treat as labor for hourly-rate pricing + the labor/material split. */
const LABOR_UNITS: ReadonlySet<CatalogItemUnit> = new Set<CatalogItemUnit>(['hour', 'day']);
/** Persisted quantity is `Decimal(12, 2)`; cap so AI output can't overflow the write. */
const MAX_QUANTITY = 9_999_999_999.99;

/** Round to 2 decimals + clamp to the column range, so the engine's net (price ×
 * quantity) matches the value the web/PDF recompute from the persisted decimal. */
function normalizeQuantity(quantity: number): number {
	if (!Number.isFinite(quantity) || quantity <= 0) {
		return 0;
	}
	return Math.min(Math.round(quantity * 100) / 100, MAX_QUANTITY);
}

export function resolveQuoteLines(input: ResolveQuoteLinesInput): ProposedQuoteLine[] {
	const lines: ProposedQuoteLine[] = [];

	// 1. Catalog matches → priced from the catalog row. Unknown refs (model
	//    hallucinated a ref not in the catalog) are dropped; a ref repeated by the
	//    model is deduped (first wins) so it can't double the subtotal.
	const seenRefs = new Set<string>();
	for (const catalogLine of input.proposal.catalogLines) {
		const item = input.catalogByRef.get(catalogLine.ref);
		if (!item || seenRefs.has(catalogLine.ref)) {
			continue;
		}
		seenRefs.add(catalogLine.ref);
		const lineKind = LABOR_UNITS.has(item.unit) ? 'labor' : 'material';
		lines.push({
			description: item.name,
			unit: item.unit,
			quantity: normalizeQuantity(catalogLine.quantity),
			unitPriceEur: item.unitPriceEur,
			vatRate: resolveVatRate(input.rules, input.urgency, lineKind, item.vatRate),
			source: 'catalog_match',
			catalogItemId: item.id,
			appliedRuleId: null,
			ruleEffectType: null,
			note: null
		});
	}

	// 2. Inferred (non-catalog) work. Labor lines get priced by a firing
	//    HOURLY_RATE rule when one applies; everything else stays unpriced.
	for (const inferred of input.proposal.inferredLines) {
		const lineKind = inferred.lineKind ?? (LABOR_UNITS.has(inferred.unit) ? 'labor' : 'material');
		const hourlyRule =
			lineKind === 'labor' && inferred.unit === 'hour'
				? findRule(
						input.rules,
						input.urgency,
						'labor',
						'HOURLY_RATE',
						'rate_eur_per_hour',
						inferred.category
					)
				: null;

		lines.push({
			description: inferred.description,
			unit: inferred.unit,
			quantity: normalizeQuantity(inferred.quantity),
			unitPriceEur: hourlyRule ? formatCents(toCents(String(hourlyRule.value))) : null,
			vatRate: resolveVatRate(input.rules, input.urgency, lineKind, DEFAULT_VAT_RATE),
			source: hourlyRule ? 'rule_applied' : 'inferred',
			catalogItemId: null,
			appliedRuleId: hourlyRule?.ruleId ?? null,
			ruleEffectType: hourlyRule ? 'rate_eur_per_hour' : null,
			note: hourlyRule?.description ?? (hourlyRule ? null : 'Stel een prijs in')
		});
	}

	// 3. Opp-wide rule lines, computed off the net subtotal of priced lines.
	const netSubtotalCents = lines.reduce((sum, line) => sum + lineNetCents(line), 0);
	const oppWideRules = stripLineKindFromOppWideRules(input.rules);
	lines.push(...buildOppWideRuleLines(oppWideRules, input.urgency, netSubtotalCents, input.travelOneWayKm));

	return lines;
}

/** Rule types whose effect acts on the WHOLE order (a surcharge/discount/fee/floor), not on a
 * single line. `lineKind` is a per-line dimension — meaningless for an order-wide effect — yet the
 * compiler routinely stamps e.g. `lineKind: "labor"` on a spoedtoeslag; the opp-wide lookup has no
 * line (passes `lineKind: null`), so a stamped rule would NEVER match (see `conditionMatches`) and
 * silently vanish. We drop `lineKind` from these rules so they match order-wide. */
const OPP_WIDE_RULE_TYPES: ReadonlySet<string> = new Set(['TRAVEL', 'URGENCY', 'DISCOUNT', 'MINIMUM_ORDER']);

/**
 * Strip `lineKind` (only) from opp-wide rules. We deliberately DO NOT strip `category`: a
 * category-scoped adjustment (e.g. "50% spoedtoeslag op loodgieterswerk" → `category: "plumbing"`)
 * is a REAL narrowing, and the order-wide engine can't apply it to just the plumbing subtotal.
 * Stripping it would surcharge the ENTIRE order — over-billing. Left intact, the rule simply doesn't
 * match the null-category opp-wide context and is dropped (the pre-existing behaviour). A per-category
 * surcharge base is a separate future feature; silently over-charging is not an acceptable stand-in.
 */
function stripLineKindFromOppWideRules(rules: ReadonlyArray<EvaluableRule>): EvaluableRule[] {
	return rules.map(rule => {
		if (!OPP_WIDE_RULE_TYPES.has(rule.ruleType) || rule.condition?.lineKind == null) {
			return rule;
		}
		const next = { ...rule.condition };
		delete next.lineKind;
		return { ...rule, condition: next };
	});
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
	netSubtotalCents: number,
	travelOneWayKm: number | undefined
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
			out.push(ruleLine(`Spoedtoeslag (${formatPercent(urgencyRule.value)}%)`, surchargeCents, urgencyRule));
			orderCents += surchargeCents;
		}
	}

	const travelRule = findRule(rules, urgency, null, 'TRAVEL', 'flat_fee_eur');
	if (travelRule) {
		const travelCents = toCents(String(travelRule.value));
		out.push(ruleLine('Voorrijkosten', travelCents, travelRule));
		orderCents += travelCents;
	}

	// Per-km travel — only when we have a geocoded one-way road distance. At most one TRAVEL rule
	// fires (single winner per ruleType), so this and the flat-fee branch are mutually exclusive.
	// Charged round-trip (heen én terug) for any distance beyond the free radius.
	const perKmRule = findRule(rules, urgency, null, 'TRAVEL', 'per_km_eur');
	if (perKmRule && travelOneWayKm !== undefined && travelOneWayKm > (perKmRule.freeUnderKm ?? 0)) {
		const billableKm = Math.round(travelOneWayKm * 2 * 10) / 10; // round-trip, 1 decimal
		const travelCents = Math.round(billableKm * perKmRule.value * 100);
		if (travelCents > 0) {
			out.push(ruleLine(`Voorrijkosten (${formatKm(billableKm)} km retour)`, travelCents, perKmRule));
			orderCents += travelCents;
		}
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
			const label =
				discountRule.effectType === 'discount_percent' ? `Korting (${formatPercent(discountRule.value)}%)` : 'Korting';
			out.push(ruleLine(label, -applied, discountRule));
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
		ruleEffectType: rule.effectType,
		note: rule.description
	};
}

/** A rule matched by `findRule`, flattened to the fields the resolver consumes. */
interface MatchedRule {
	ruleId: string;
	ruleType: string;
	effectType: PricingEffectType;
	value: number;
	description: string;
	/** Travel `per_km_eur` only: km below which the charge is waived. `null` otherwise. */
	freeUnderKm: number | null;
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
	effectType: PricingEffectType,
	category: string | null = null
): MatchedRule | null {
	const applied = evaluateRules(rules, {
		category,
		urgency,
		jurisdiction: RESOLVER_JURISDICTION,
		lineKind
	});
	const match = applied.find(rule => rule.ruleType === ruleType);
	if (!match) {
		return null;
	}
	const effect = match.effect as { type?: unknown; value?: unknown; freeUnderKm?: unknown };
	if (effect.type !== effectType || typeof effect.value !== 'number') {
		return null;
	}
	return {
		ruleId: match.ruleId,
		ruleType: match.ruleType,
		effectType,
		value: effect.value,
		description: match.description,
		freeUnderKm: typeof effect.freeUnderKm === 'number' ? effect.freeUnderKm : null
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
	const rate = vatRule ? vatRule.value : fallback;
	// The rule value is owner-configured; clamp to a sane integer percentage so a
	// miscompiled rule (e.g. 250 or -5) can't persist an out-of-range VAT rate.
	return Math.min(Math.max(Math.round(rate), 0), 100);
}

function toCents(value: string): number {
	return Math.round(Number(value) * 100);
}

function formatCents(cents: number): string {
	return (cents / 100).toFixed(2);
}

/** Dutch-formatted km for a line description (e.g. "104,2"). */
function formatKm(km: number): string {
	return km.toLocaleString('nl-NL', { maximumFractionDigits: 1 });
}

/** Dutch-formatted percentage for a line description (e.g. "50", "12,5") — no trailing zeros. */
function formatPercent(value: number): string {
	return value.toLocaleString('nl-NL', { maximumFractionDigits: 2 });
}

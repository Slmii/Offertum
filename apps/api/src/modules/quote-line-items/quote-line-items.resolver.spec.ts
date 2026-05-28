import type { LineItemProposal } from '@/modules/ai/line-item-proposer/line-item-proposer.types';
import type { EvaluableRule } from '@/modules/pricing-playbook/rule-engine';
import {
	type ResolveQuoteLinesInput,
	type ResolverCatalogEntry,
	resolveQuoteLines
} from '@/modules/quote-line-items/quote-line-items.resolver';
import { describe, expect, it } from '@jest/globals';

/**
 * Unit tests for the engine-price layer. These are the W10.1 guardrail against the
 * one failure mode that matters most: a wrong number on a quote. Every price the
 * resolver emits must trace to a catalog row or a firing rule — never the model.
 */

function catalog(entries: ResolverCatalogEntry[]): ReadonlyMap<string, ResolverCatalogEntry> {
	return new Map(entries.map((entry, index) => [`C${index + 1}`, entry]));
}

function makeRule(overrides: Partial<EvaluableRule> & Pick<EvaluableRule, 'ruleType' | 'effect'>): EvaluableRule {
	return {
		id: overrides.id ?? `rule-${overrides.ruleType}`,
		ruleType: overrides.ruleType,
		condition: overrides.condition ?? {},
		effect: overrides.effect,
		priority: overrides.priority ?? 100,
		active: overrides.active ?? true,
		manualOverride: overrides.manualOverride ?? false,
		description: overrides.description ?? `${overrides.ruleType} rule`,
		sourceSpan: overrides.sourceSpan ?? null,
		createdAt: overrides.createdAt ?? new Date('2026-01-01T00:00:00Z')
	};
}

function proposal(overrides: Partial<LineItemProposal>): LineItemProposal {
	return {
		catalogLines: overrides.catalogLines ?? [],
		inferredLines: overrides.inferredLines ?? []
	};
}

function input(overrides: Partial<ResolveQuoteLinesInput>): ResolveQuoteLinesInput {
	return {
		proposal: overrides.proposal ?? proposal({}),
		catalogByRef: overrides.catalogByRef ?? new Map(),
		rules: overrides.rules ?? [],
		urgency: overrides.urgency ?? 'normal'
	};
}

describe('resolveQuoteLines', () => {
	it('prices a catalog match from the catalog row, never from the model', () => {
		const lines = resolveQuoteLines(
			input({
				proposal: proposal({ catalogLines: [{ ref: 'C1', quantity: 4, reason: 'matches' }] }),
				catalogByRef: catalog([
					{ id: 'cat-1', name: 'Arbeid loodgieter', unit: 'hour', unitPriceEur: '85.00', vatRate: 21 }
				])
			})
		);

		expect(lines).toHaveLength(1);
		expect(lines[0]).toMatchObject({
			description: 'Arbeid loodgieter',
			unit: 'hour',
			quantity: 4,
			unitPriceEur: '85.00',
			vatRate: 21,
			source: 'catalog_match',
			catalogItemId: 'cat-1',
			appliedRuleId: null
		});
	});

	it('drops catalog lines whose ref is not in the catalog (model hallucination)', () => {
		const lines = resolveQuoteLines(
			input({
				proposal: proposal({ catalogLines: [{ ref: 'C9', quantity: 2, reason: 'hallucinated' }] }),
				catalogByRef: catalog([
					{ id: 'cat-1', name: 'Tegelwerk', unit: 'square_meter', unitPriceEur: '45.00', vatRate: 21 }
				])
			})
		);

		expect(lines).toHaveLength(0);
	});

	it('prices an inferred labor (hour) line from a firing HOURLY_RATE rule → rule_applied', () => {
		const lines = resolveQuoteLines(
			input({
				proposal: proposal({
					inferredLines: [
						{ description: 'Demontagewerk', unit: 'hour', quantity: 3, lineKind: 'labor', reason: 'x' }
					]
				}),
				rules: [
					makeRule({
						id: 'hr-1',
						ruleType: 'HOURLY_RATE',
						effect: { type: 'rate_eur_per_hour', value: 90 },
						description: 'Standaard uurtarief'
					})
				]
			})
		);

		expect(lines).toHaveLength(1);
		expect(lines[0]).toMatchObject({
			description: 'Demontagewerk',
			unit: 'hour',
			quantity: 3,
			unitPriceEur: '90.00',
			source: 'rule_applied',
			appliedRuleId: 'hr-1',
			note: 'Standaard uurtarief'
		});
	});

	it('leaves an inferred line unpriced with an owner prompt when no rule applies', () => {
		const lines = resolveQuoteLines(
			input({
				proposal: proposal({
					inferredLines: [
						{
							description: 'Speciaal materiaal',
							unit: 'piece',
							quantity: 5,
							lineKind: 'material',
							reason: 'x'
						}
					]
				})
			})
		);

		expect(lines).toHaveLength(1);
		expect(lines[0]).toMatchObject({
			unitPriceEur: null,
			source: 'inferred',
			appliedRuleId: null,
			note: 'Stel een prijs in'
		});
	});

	it('does not price an inferred labor line billed per day via the hourly rule', () => {
		const lines = resolveQuoteLines(
			input({
				proposal: proposal({
					inferredLines: [
						{ description: 'Klusdag', unit: 'day', quantity: 2, lineKind: 'labor', reason: 'x' }
					]
				}),
				rules: [makeRule({ ruleType: 'HOURLY_RATE', effect: { type: 'rate_eur_per_hour', value: 90 } })]
			})
		);

		expect(lines[0]).toMatchObject({ unitPriceEur: null, source: 'inferred' });
	});

	it('appends an urgency surcharge computed off the net subtotal', () => {
		const lines = resolveQuoteLines(
			input({
				proposal: proposal({ catalogLines: [{ ref: 'C1', quantity: 2, reason: 'x' }] }),
				catalogByRef: catalog([
					{ id: 'cat-1', name: 'Arbeid', unit: 'hour', unitPriceEur: '100.00', vatRate: 21 }
				]),
				urgency: 'emergency',
				rules: [
					makeRule({
						id: 'urg-1',
						ruleType: 'URGENCY',
						condition: { urgency: 'emergency' },
						effect: { type: 'surcharge_percent', value: 25 },
						description: 'Spoedtoeslag 25%'
					})
				]
			})
		);

		// Net subtotal = 2 × €100 = €200; 25% = €50.
		const surcharge = lines.find(line => line.description === 'Spoedtoeslag');
		expect(surcharge).toMatchObject({
			unitPriceEur: '50.00',
			source: 'rule_applied',
			appliedRuleId: 'urg-1'
		});
	});

	it('appends a travel flat fee', () => {
		const lines = resolveQuoteLines(
			input({
				proposal: proposal({ catalogLines: [{ ref: 'C1', quantity: 1, reason: 'x' }] }),
				catalogByRef: catalog([
					{ id: 'cat-1', name: 'Arbeid', unit: 'hour', unitPriceEur: '100.00', vatRate: 21 }
				]),
				rules: [
					makeRule({
						id: 'trv-1',
						ruleType: 'TRAVEL',
						effect: { type: 'flat_fee_eur', value: 35 },
						description: 'Voorrijkosten'
					})
				]
			})
		);

		expect(lines.find(line => line.description === 'Voorrijkosten')).toMatchObject({
			unitPriceEur: '35.00',
			source: 'rule_applied',
			appliedRuleId: 'trv-1'
		});
	});

	it('appends a percentage discount as a negative line', () => {
		const lines = resolveQuoteLines(
			input({
				proposal: proposal({ catalogLines: [{ ref: 'C1', quantity: 1, reason: 'x' }] }),
				catalogByRef: catalog([
					{ id: 'cat-1', name: 'Arbeid', unit: 'hour', unitPriceEur: '200.00', vatRate: 21 }
				]),
				rules: [
					makeRule({
						ruleType: 'DISCOUNT',
						effect: { type: 'discount_percent', value: 10 },
						description: '10% korting'
					})
				]
			})
		);

		expect(lines.find(line => line.description === 'Korting')).toMatchObject({ unitPriceEur: '-20.00' });
	});

	it('appends a fixed-euro discount as a negative line', () => {
		const lines = resolveQuoteLines(
			input({
				proposal: proposal({ catalogLines: [{ ref: 'C1', quantity: 1, reason: 'x' }] }),
				catalogByRef: catalog([
					{ id: 'cat-1', name: 'Arbeid', unit: 'hour', unitPriceEur: '200.00', vatRate: 21 }
				]),
				rules: [
					makeRule({
						ruleType: 'DISCOUNT',
						effect: { type: 'discount_eur', value: 15 },
						description: 'Vaste korting'
					})
				]
			})
		);

		expect(lines.find(line => line.description === 'Korting')).toMatchObject({ unitPriceEur: '-15.00' });
	});

	it('tops up to the minimum order when the subtotal is below it', () => {
		const lines = resolveQuoteLines(
			input({
				proposal: proposal({ catalogLines: [{ ref: 'C1', quantity: 1, reason: 'x' }] }),
				catalogByRef: catalog([
					{ id: 'cat-1', name: 'Arbeid', unit: 'hour', unitPriceEur: '60.00', vatRate: 21 }
				]),
				rules: [
					makeRule({
						ruleType: 'MINIMUM_ORDER',
						effect: { type: 'minimum_eur', value: 100 },
						description: 'Minimumorderbedrag'
					})
				]
			})
		);

		// Subtotal €60, minimum €100 → top-up €40.
		expect(lines.find(line => line.description === 'Minimumordertoeslag')).toMatchObject({ unitPriceEur: '40.00' });
	});

	it('does not top up when the subtotal already meets the minimum', () => {
		const lines = resolveQuoteLines(
			input({
				proposal: proposal({ catalogLines: [{ ref: 'C1', quantity: 1, reason: 'x' }] }),
				catalogByRef: catalog([
					{ id: 'cat-1', name: 'Arbeid', unit: 'hour', unitPriceEur: '150.00', vatRate: 21 }
				]),
				rules: [makeRule({ ruleType: 'MINIMUM_ORDER', effect: { type: 'minimum_eur', value: 100 } })]
			})
		);

		expect(lines.find(line => line.description === 'Minimumordertoeslag')).toBeUndefined();
	});

	it('measures the minimum against the full order (surcharge + travel count)', () => {
		const lines = resolveQuoteLines(
			input({
				proposal: proposal({ catalogLines: [{ ref: 'C1', quantity: 1, reason: 'x' }] }),
				catalogByRef: catalog([
					{ id: 'cat-1', name: 'Arbeid', unit: 'hour', unitPriceEur: '100.00', vatRate: 21 }
				]),
				urgency: 'emergency',
				rules: [
					makeRule({
						ruleType: 'URGENCY',
						condition: { urgency: 'emergency' },
						effect: { type: 'surcharge_percent', value: 35 }
					}),
					makeRule({ ruleType: 'TRAVEL', effect: { type: 'flat_fee_eur', value: 45 } }),
					makeRule({ ruleType: 'MINIMUM_ORDER', effect: { type: 'minimum_eur', value: 175 } })
				]
			})
		);

		// Base €100 + spoedtoeslag €35 + voorrijkosten €45 = €180 ≥ €175 → no top-up.
		expect(lines.find(line => line.description === 'Minimumordertoeslag')).toBeUndefined();
	});

	it('tops up against the full order when still below the minimum', () => {
		const lines = resolveQuoteLines(
			input({
				proposal: proposal({ catalogLines: [{ ref: 'C1', quantity: 1, reason: 'x' }] }),
				catalogByRef: catalog([
					{ id: 'cat-1', name: 'Arbeid', unit: 'hour', unitPriceEur: '50.00', vatRate: 21 }
				]),
				urgency: 'emergency',
				rules: [
					makeRule({
						ruleType: 'URGENCY',
						condition: { urgency: 'emergency' },
						effect: { type: 'surcharge_percent', value: 35 }
					}),
					makeRule({ ruleType: 'TRAVEL', effect: { type: 'flat_fee_eur', value: 45 } }),
					makeRule({ ruleType: 'MINIMUM_ORDER', effect: { type: 'minimum_eur', value: 175 } })
				]
			})
		);

		// Base €50 + spoedtoeslag €17.50 + voorrijkosten €45 = €112.50 → top-up €62.50.
		expect(lines.find(line => line.description === 'Minimumordertoeslag')).toMatchObject({ unitPriceEur: '62.50' });
	});

	it('lets a VAT rule override a line VAT rate', () => {
		const lines = resolveQuoteLines(
			input({
				proposal: proposal({ catalogLines: [{ ref: 'C1', quantity: 1, reason: 'x' }] }),
				catalogByRef: catalog([
					{ id: 'cat-1', name: 'Schilderwerk', unit: 'hour', unitPriceEur: '50.00', vatRate: 21 }
				]),
				rules: [
					makeRule({
						ruleType: 'VAT',
						condition: { lineKind: 'labor' },
						effect: { type: 'vat_rate', value: 9 },
						description: 'Verlaagd tarief arbeid'
					})
				]
			})
		);

		expect(lines[0]?.vatRate).toBe(9);
	});

	it('excludes unpriced inferred lines from the net subtotal used for rule lines', () => {
		const lines = resolveQuoteLines(
			input({
				proposal: proposal({
					catalogLines: [{ ref: 'C1', quantity: 1, reason: 'x' }],
					inferredLines: [
						{
							description: 'Onbekend materiaal',
							unit: 'piece',
							quantity: 99,
							lineKind: 'material',
							reason: 'x'
						}
					]
				}),
				catalogByRef: catalog([
					{ id: 'cat-1', name: 'Arbeid', unit: 'hour', unitPriceEur: '100.00', vatRate: 21 }
				]),
				rules: [makeRule({ ruleType: 'URGENCY', effect: { type: 'surcharge_percent', value: 10 } })]
			})
		);

		// Surcharge is 10% of €100 (catalog line only), not affected by the unpriced line.
		expect(lines.find(line => line.description === 'Spoedtoeslag')).toMatchObject({ unitPriceEur: '10.00' });
	});

	it('dedupes a catalog ref the model repeated (first wins, no doubled subtotal)', () => {
		const lines = resolveQuoteLines(
			input({
				proposal: proposal({
					catalogLines: [
						{ ref: 'C1', quantity: 2, reason: 'x' },
						{ ref: 'C1', quantity: 5, reason: 'dup' }
					]
				}),
				catalogByRef: catalog([
					{ id: 'cat-1', name: 'Arbeid', unit: 'hour', unitPriceEur: '100.00', vatRate: 21 }
				])
			})
		);

		const catalogLines = lines.filter(line => line.source === 'catalog_match');
		expect(catalogLines).toHaveLength(1);
		expect(catalogLines[0]?.quantity).toBe(2);
	});

	it('rounds an over-precise AI quantity to 2 decimals', () => {
		const lines = resolveQuoteLines(
			input({
				proposal: proposal({
					inferredLines: [
						{ description: 'Demontage', unit: 'hour', quantity: 3.333, lineKind: 'labor', reason: 'x' }
					]
				}),
				rules: [makeRule({ ruleType: 'HOURLY_RATE', effect: { type: 'rate_eur_per_hour', value: 90 } })]
			})
		);

		expect(lines[0]?.quantity).toBe(3.33);
	});

	it('clamps an out-of-range VAT rule rate to a valid percentage', () => {
		const lines = resolveQuoteLines(
			input({
				proposal: proposal({ catalogLines: [{ ref: 'C1', quantity: 1, reason: 'x' }] }),
				catalogByRef: catalog([
					{ id: 'cat-1', name: 'Arbeid', unit: 'hour', unitPriceEur: '50.00', vatRate: 21 }
				]),
				rules: [
					makeRule({
						ruleType: 'VAT',
						condition: { lineKind: 'labor' },
						effect: { type: 'vat_rate', value: 250 }
					})
				]
			})
		);

		expect(lines[0]?.vatRate).toBe(100);
	});
});

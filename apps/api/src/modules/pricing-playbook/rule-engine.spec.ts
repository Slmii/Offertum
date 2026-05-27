import {
	evaluateRules,
	type EvaluableRule,
	type PricingRuleEvaluationContext
} from '@/modules/pricing-playbook/rule-engine';
import { describe, expect, it } from '@jest/globals';

function makeRule(overrides: Partial<EvaluableRule> & Pick<EvaluableRule, 'id' | 'ruleType'>): EvaluableRule {
	return {
		condition: {},
		effect: { type: 'rate_eur_per_hour', value: 75 },
		priority: 0,
		active: true,
		manualOverride: false,
		description: 'Test rule',
		sourceSpan: null,
		createdAt: new Date('2026-01-01T00:00:00.000Z'),
		...overrides
	};
}

const BASE_CONTEXT: PricingRuleEvaluationContext = {
	category: 'plumbing',
	urgency: 'normal',
	jurisdiction: 'NL',
	lineKind: 'labor'
};

describe('evaluateRules', () => {
	it('returns empty when no rules are provided', () => {
		expect(evaluateRules([], BASE_CONTEXT)).toEqual([]);
	});

	it('returns empty when no rule matches the context', () => {
		const rules = [makeRule({ id: 'r1', ruleType: 'hourly_rate', condition: { category: 'electrical' } })];
		expect(evaluateRules(rules, BASE_CONTEXT)).toEqual([]);
	});

	it('returns the matching rule when exactly one applies', () => {
		const rules = [makeRule({ id: 'r1', ruleType: 'hourly_rate', condition: { category: 'plumbing' } })];
		const result = evaluateRules(rules, BASE_CONTEXT);
		expect(result).toHaveLength(1);
		expect(result[0]?.ruleId).toBe('r1');
	});

	it('applies multiple matching rules of different ruleTypes', () => {
		const rules = [
			makeRule({ id: 'r1', ruleType: 'hourly_rate', condition: { category: 'plumbing' } }),
			makeRule({ id: 'r2', ruleType: 'vat', effect: { type: 'vat_rate', value: 21 } }),
			makeRule({
				id: 'r3',
				ruleType: 'urgency',
				condition: { urgency: 'normal' },
				effect: { type: 'surcharge_percent', value: 0 }
			})
		];
		const result = evaluateRules(rules, BASE_CONTEXT);
		expect(result.map(r => r.ruleId).sort()).toEqual(['r1', 'r2', 'r3']);
	});

	it('resolves same-ruleType conflicts by higher priority', () => {
		const rules = [
			makeRule({
				id: 'low',
				ruleType: 'hourly_rate',
				priority: 10,
				effect: { type: 'rate_eur_per_hour', value: 75 }
			}),
			makeRule({
				id: 'high',
				ruleType: 'hourly_rate',
				priority: 50,
				effect: { type: 'rate_eur_per_hour', value: 95 }
			})
		];
		const result = evaluateRules(rules, BASE_CONTEXT);
		expect(result).toHaveLength(1);
		expect(result[0]?.ruleId).toBe('high');
		expect(result[0]?.effect).toEqual({ type: 'rate_eur_per_hour', value: 95 });
	});

	it('breaks priority ties by condition specificity (more keys win over catch-all)', () => {
		// Real-world case: LLM emits a category-specific hourly_rate at the same
		// priority as the global default. Engine should prefer the more-specific
		// rule even at equal priority — otherwise the catch-all wins and the
		// category rate is silently ignored.
		const rules = [
			makeRule({
				id: 'catch_all',
				ruleType: 'hourly_rate',
				priority: 100,
				condition: { lineKind: 'labor' },
				effect: { type: 'rate_eur_per_hour', value: 80 }
			}),
			makeRule({
				id: 'category_specific',
				ruleType: 'hourly_rate',
				priority: 100,
				condition: { category: 'plumbing', lineKind: 'labor' },
				effect: { type: 'rate_eur_per_hour', value: 95 }
			})
		];
		const result = evaluateRules(rules, BASE_CONTEXT);
		expect(result[0]?.ruleId).toBe('category_specific');
		expect(result[0]?.effect).toEqual({ type: 'rate_eur_per_hour', value: 95 });
	});

	it('higher priority still wins over more-specific condition', () => {
		// Explicit owner-set priority should beat specificity — specificity is
		// only a tiebreaker.
		const rules = [
			makeRule({
				id: 'specific_low_priority',
				ruleType: 'hourly_rate',
				priority: 100,
				condition: { category: 'plumbing', lineKind: 'labor' },
				effect: { type: 'rate_eur_per_hour', value: 95 }
			}),
			makeRule({
				id: 'catch_all_high_priority',
				ruleType: 'hourly_rate',
				priority: 500,
				condition: { lineKind: 'labor' },
				effect: { type: 'rate_eur_per_hour', value: 80 }
			})
		];
		const result = evaluateRules(rules, BASE_CONTEXT);
		expect(result[0]?.ruleId).toBe('catch_all_high_priority');
	});

	it('breaks priority + specificity ties by older createdAt', () => {
		const older = new Date('2026-01-01T00:00:00.000Z');
		const newer = new Date('2026-02-01T00:00:00.000Z');
		const rules = [
			makeRule({ id: 'newer', ruleType: 'hourly_rate', priority: 10, createdAt: newer }),
			makeRule({ id: 'older', ruleType: 'hourly_rate', priority: 10, createdAt: older })
		];
		const result = evaluateRules(rules, BASE_CONTEXT);
		expect(result[0]?.ruleId).toBe('older');
	});

	it('ignores inactive rules entirely', () => {
		const rules = [
			makeRule({ id: 'inactive', ruleType: 'hourly_rate', priority: 100, active: false }),
			makeRule({ id: 'active', ruleType: 'hourly_rate', priority: 10 })
		];
		const result = evaluateRules(rules, BASE_CONTEXT);
		expect(result).toHaveLength(1);
		expect(result[0]?.ruleId).toBe('active');
	});

	it('manual override beats higher-priority LLM rule on the same ruleType slot', () => {
		const rules = [
			// LLM rule with high natural priority.
			makeRule({
				id: 'llm',
				ruleType: 'hourly_rate',
				priority: 100,
				manualOverride: false,
				effect: { type: 'rate_eur_per_hour', value: 75 }
			}),
			// Manual override with low natural priority — gets the +1000 bump.
			makeRule({
				id: 'manual',
				ruleType: 'hourly_rate',
				priority: 0,
				manualOverride: true,
				effect: { type: 'rate_eur_per_hour', value: 95 }
			})
		];
		const result = evaluateRules(rules, BASE_CONTEXT);
		expect(result[0]?.ruleId).toBe('manual');
		expect(result[0]?.effect).toEqual({ type: 'rate_eur_per_hour', value: 95 });
	});

	it('treats empty condition {} as "matches anything"', () => {
		const rules = [makeRule({ id: 'catch_all', ruleType: 'minimum_order', condition: {} })];
		const result = evaluateRules(rules, BASE_CONTEXT);
		expect(result).toHaveLength(1);
		expect(result[0]?.ruleId).toBe('catch_all');
	});

	it('condition matching is case-insensitive for string values', () => {
		const rules = [makeRule({ id: 'r1', ruleType: 'hourly_rate', condition: { category: 'PLUMBING' } })];
		const result = evaluateRules(rules, { ...BASE_CONTEXT, category: 'plumbing' });
		expect(result).toHaveLength(1);
	});

	it('condition with multiple keys requires ALL to match (AND, not OR)', () => {
		const rules = [
			makeRule({
				id: 'multi',
				ruleType: 'vat',
				condition: { jurisdiction: 'NL', lineKind: 'labor' }
			})
		];
		const matchAll: PricingRuleEvaluationContext = { ...BASE_CONTEXT, jurisdiction: 'NL', lineKind: 'labor' };
		const matchOne: PricingRuleEvaluationContext = { ...BASE_CONTEXT, jurisdiction: 'NL', lineKind: 'material' };
		expect(evaluateRules(rules, matchAll)).toHaveLength(1);
		expect(evaluateRules(rules, matchOne)).toHaveLength(0);
	});

	it('null context value fails any non-null condition for that key', () => {
		const rules = [makeRule({ id: 'r1', ruleType: 'urgency', condition: { urgency: 'emergency' } })];
		expect(evaluateRules(rules, { ...BASE_CONTEXT, urgency: null })).toHaveLength(0);
	});
});

import {
	hasNarrative,
	resolveConfirmedNarrativeRuleIds,
	selectRulesPassingNarrativeGate,
	type NarrativeGateRule
} from '@/modules/quote-line-items/pricing-rule-narrative-gate';

const rule = (id: string, conditionNarrative: string | null): NarrativeGateRule => ({ id, conditionNarrative });

describe('hasNarrative', () => {
	it('is false for null, empty, and whitespace-only narratives', () => {
		expect(hasNarrative(rule('a', null))).toBe(false);
		expect(hasNarrative(rule('a', ''))).toBe(false);
		expect(hasNarrative(rule('a', '   \n\t '))).toBe(false);
	});

	it('is true for a real narrative', () => {
		expect(hasNarrative(rule('a', 'renovaties van woningen ouder dan 2 jaar'))).toBe(true);
	});
});

describe('selectRulesPassingNarrativeGate', () => {
	it('always keeps rules without a narrative, regardless of confirmations', () => {
		const rules = [rule('plain-1', null), rule('plain-2', '  ')];
		expect(selectRulesPassingNarrativeGate(rules, new Set()).map(r => r.id)).toEqual(['plain-1', 'plain-2']);
	});

	it('keeps a narrative rule only when its id is confirmed', () => {
		const rules = [rule('n-yes', 'klanten in België'), rule('n-no', 'spoed binnen 4 uur')];
		const result = selectRulesPassingNarrativeGate(rules, new Set(['n-yes']));
		expect(result.map(r => r.id)).toEqual(['n-yes']);
	});

	it('drops ALL narrative rules on fail-closed (empty confirmation set) but keeps plain rules', () => {
		const rules = [rule('plain', null), rule('n-1', 'renovatie'), rule('n-2', 'België')];
		const result = selectRulesPassingNarrativeGate(rules, new Set());
		expect(result.map(r => r.id)).toEqual(['plain']);
	});

	it('preserves input order and does not mutate the input', () => {
		const rules = [rule('a', null), rule('b', 'x'), rule('c', null)];
		const snapshot = rules.map(r => r.id);
		const result = selectRulesPassingNarrativeGate(rules, new Set(['b']));
		expect(result.map(r => r.id)).toEqual(['a', 'b', 'c']);
		expect(rules.map(r => r.id)).toEqual(snapshot);
	});
});

describe('resolveConfirmedNarrativeRuleIds', () => {
	const refMap = new Map([
		['R1', 'rule-1'],
		['R2', 'rule-2']
	]);

	it('confirms a rule with exactly one true verdict', () => {
		const confirmed = resolveConfirmedNarrativeRuleIds(refMap, [
			{ ref: 'R1', applies: true },
			{ ref: 'R2', applies: false }
		]);
		expect([...confirmed]).toEqual(['rule-1']);
	});

	it('fail-closed: conflicting duplicate verdicts for a ref are NOT confirmed', () => {
		const confirmed = resolveConfirmedNarrativeRuleIds(refMap, [
			{ ref: 'R2', applies: false },
			{ ref: 'R2', applies: true }
		]);
		expect(confirmed.size).toBe(0);
	});

	it('fail-closed: duplicate all-true verdicts for a ref are still NOT confirmed', () => {
		const confirmed = resolveConfirmedNarrativeRuleIds(refMap, [
			{ ref: 'R1', applies: true },
			{ ref: 'R1', applies: true }
		]);
		expect(confirmed.size).toBe(0);
	});

	it('ignores unknown refs and missing verdicts', () => {
		const confirmed = resolveConfirmedNarrativeRuleIds(refMap, [{ ref: 'R9', applies: true }]);
		expect(confirmed.size).toBe(0);
	});
});

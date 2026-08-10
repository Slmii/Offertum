import { describe, expect, it } from '@jest/globals';
import { quoteNetEuros, type QuoteValueLine } from './quote-value';

const line = (over: Partial<QuoteValueLine> = {}): QuoteValueLine => ({
	quantity: '1',
	unitPriceEur: '100.00',
	vatRate: 21,
	vatReverseCharged: false,
	source: 'catalog_match',
	ruleEffectType: null,
	...over
});

describe('quoteNetEuros', () => {
	it('returns 0 for no lines', () => {
		expect(quoteNetEuros([])).toBe(0);
	});

	it('sums net (ex-VAT) euros across lines', () => {
		expect(quoteNetEuros([line({ quantity: '2', unitPriceEur: '50.00' }), line({ unitPriceEur: '100.00' })])).toBe(
			200
		);
	});

	it('ignores unpriced lines', () => {
		expect(quoteNetEuros([line({ unitPriceEur: null }), line({ unitPriceEur: '100.00' })])).toBe(100);
	});

	it('counts reverse-charge net but no VAT', () => {
		expect(quoteNetEuros([line({ unitPriceEur: '100.00', vatReverseCharged: true })])).toBe(100);
	});

	it('applies a percent discount off the work-only subtotal, matching the PDF/editor', () => {
		expect(quoteNetEuros([line({ unitPriceEur: '100.00' })], { type: 'percent', value: 10 })).toBe(90);
	});

	it('excludes order-level adjustment lines (e.g. a rule-applied surcharge) from the discount base', () => {
		const lines = [
			line({ unitPriceEur: '100.00' }),
			line({ unitPriceEur: '10.00', source: 'rule_applied', ruleEffectType: 'surcharge_percent' })
		];
		// 10% of the €100 work subtotal only, not the €110 total.
		expect(quoteNetEuros(lines, { type: 'percent', value: 10 })).toBe(100);
	});
});

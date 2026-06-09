import { describe, expect, it } from '@jest/globals';
import { quoteNetEuros, type QuoteValueLine } from './quote-value';

const line = (over: Partial<QuoteValueLine> = {}): QuoteValueLine => ({
	quantity: '1',
	unitPriceEur: '100.00',
	vatRate: 21,
	vatReverseCharged: false,
	...over
});

describe('quoteNetEuros', () => {
	it('returns 0 for no lines', () => {
		expect(quoteNetEuros([])).toBe(0);
	});

	it('sums net (ex-VAT) euros across lines', () => {
		expect(quoteNetEuros([line({ quantity: '2', unitPriceEur: '50.00' }), line({ unitPriceEur: '100.00' })])).toBe(200);
	});

	it('ignores unpriced lines', () => {
		expect(quoteNetEuros([line({ unitPriceEur: null }), line({ unitPriceEur: '100.00' })])).toBe(100);
	});

	it('counts reverse-charge net but no VAT', () => {
		expect(quoteNetEuros([line({ unitPriceEur: '100.00', vatReverseCharged: true })])).toBe(100);
	});
});

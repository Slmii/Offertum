import { computeQuoteTotals, type QuoteTotalLineInput } from '@offertum/shared';
import { describe, expect, it } from '@jest/globals';

/**
 * W10.3 acceptance criterion: all BTW brackets (9 / 21 / 0 / verlegd) compute
 * correctly on a multi-bracket quote. Integer-cents math — a wrong number on a
 * quote is a real-world liability.
 */

function line(overrides: Partial<QuoteTotalLineInput>): QuoteTotalLineInput {
	return {
		quantity: '1',
		unitPriceEur: '100.00',
		vatRate: 21,
		vatReverseCharged: false,
		...overrides
	};
}

describe('computeQuoteTotals', () => {
	it('computes a single 21% bracket', () => {
		const totals = computeQuoteTotals([line({ quantity: '2', unitPriceEur: '100.00', vatRate: 21 })]);
		expect(totals.netCents).toBe(20000);
		expect(totals.vatCents).toBe(4200);
		expect(totals.grossCents).toBe(24200);
		expect(totals.brackets).toHaveLength(1);
	});

	it('splits a multi-bracket quote (0 / 9 / 21 / verlegd) correctly — the AC', () => {
		const totals = computeQuoteTotals([
			line({ quantity: '2', unitPriceEur: '100.00', vatRate: 21 }), // net 20000, vat 4200
			line({ quantity: '1', unitPriceEur: '50.00', vatRate: 9 }), //  net  5000, vat  450
			line({ quantity: '1', unitPriceEur: '30.00', vatRate: 0 }), //  net  3000, vat    0
			line({ quantity: '1', unitPriceEur: '1000.00', vatRate: 21, vatReverseCharged: true }) // net 100000, vat 0
		]);

		// Brackets sorted: rates ascending, verlegd last.
		expect(totals.brackets.map(b => b.key)).toEqual(['0', '9', '21', 'verlegd']);

		const byKey = Object.fromEntries(totals.brackets.map(b => [b.key, b]));
		expect(byKey['21']).toMatchObject({ netCents: 20000, vatCents: 4200, reverseCharged: false });
		expect(byKey['9']).toMatchObject({ netCents: 5000, vatCents: 450 });
		expect(byKey['0']).toMatchObject({ netCents: 3000, vatCents: 0 });
		expect(byKey['verlegd']).toMatchObject({ netCents: 100000, vatCents: 0, reverseCharged: true, vatRate: 0 });

		expect(totals.netCents).toBe(128000);
		expect(totals.vatCents).toBe(4650);
		expect(totals.grossCents).toBe(132650);
	});

	it('groups multiple lines in the same bracket', () => {
		const totals = computeQuoteTotals([
			line({ quantity: '1', unitPriceEur: '100.00', vatRate: 21 }),
			line({ quantity: '1', unitPriceEur: '200.00', vatRate: 21 })
		]);
		expect(totals.brackets).toHaveLength(1);
		expect(totals.brackets[0]).toMatchObject({ key: '21', netCents: 30000, vatCents: 6300 });
	});

	it('reverse-charge contributes net but zero VAT', () => {
		const totals = computeQuoteTotals([line({ unitPriceEur: '500.00', vatRate: 21, vatReverseCharged: true })]);
		expect(totals.netCents).toBe(50000);
		expect(totals.vatCents).toBe(0);
		expect(totals.grossCents).toBe(50000);
	});

	it('excludes unpriced lines from money totals and counts them', () => {
		const totals = computeQuoteTotals([
			line({ quantity: '1', unitPriceEur: '100.00', vatRate: 21 }),
			line({ quantity: '5', unitPriceEur: null, vatRate: 21 })
		]);
		expect(totals.netCents).toBe(10000);
		expect(totals.vatCents).toBe(2100);
		expect(totals.unpricedLineCount).toBe(1);
		expect(totals.brackets).toHaveLength(1);
	});

	it('rounds VAT to the nearest cent', () => {
		// 0.10 × 3 = 0.30 net; 21% = 6.3c → rounds to 6c.
		const totals = computeQuoteTotals([line({ quantity: '3', unitPriceEur: '0.10', vatRate: 21 })]);
		expect(totals.netCents).toBe(30);
		expect(totals.vatCents).toBe(6);
	});

	it('returns zeros for an empty quote', () => {
		const totals = computeQuoteTotals([]);
		expect(totals).toMatchObject({ netCents: 0, vatCents: 0, grossCents: 0, unpricedLineCount: 0 });
		expect(totals.brackets).toHaveLength(0);
	});
});

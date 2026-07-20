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

	it('reports discountCents 0 when no discount is given', () => {
		const totals = computeQuoteTotals([line({ quantity: '2', unitPriceEur: '100.00' })]);
		expect(totals.discountCents).toBe(0);
		expect(totals.netCents).toBe(20000);
	});

	it('applies a percentage discount to the net and recomputes VAT on the discounted net', () => {
		// €200 net @21% − 10% = €180 net; VAT 21% of 180 = 37.80.
		const totals = computeQuoteTotals([line({ quantity: '2', unitPriceEur: '100.00', vatRate: 21 })], {
			type: 'percent',
			value: 10
		});
		expect(totals.discountCents).toBe(2000);
		expect(totals.netCents).toBe(18000);
		expect(totals.vatCents).toBe(3780);
		expect(totals.grossCents).toBe(21780);
	});

	it('applies a fixed-euro discount and caps it at the net (never below €0)', () => {
		const totals = computeQuoteTotals([line({ quantity: '1', unitPriceEur: '100.00', vatRate: 21 })], {
			type: 'eur',
			value: 250
		});
		expect(totals.discountCents).toBe(10000); // capped at the €100 net
		expect(totals.netCents).toBe(0);
		expect(totals.vatCents).toBe(0);
	});

	it('apportions a discount across mixed VAT brackets so per-bracket deductions sum exactly', () => {
		// €200 @21% + €100 @9% = €300 net; 10% discount = €30 off, split 20/10 by net weight.
		const totals = computeQuoteTotals(
			[
				line({ quantity: '2', unitPriceEur: '100.00', vatRate: 21 }),
				line({ quantity: '1', unitPriceEur: '100.00', vatRate: 9 })
			],
			{ type: 'percent', value: 10 }
		);
		expect(totals.discountCents).toBe(3000);
		const byKey = Object.fromEntries(totals.brackets.map(b => [b.key, b]));
		expect(byKey['21']).toMatchObject({ netCents: 18000, vatCents: 3780 }); // 200 − 20 = 180
		expect(byKey['9']).toMatchObject({ netCents: 9000, vatCents: 810 }); //   100 − 10 = 90
		// Bracket nets sum to the post-discount net; discount fully + exactly deducted.
		expect(totals.brackets.reduce((sum, b) => sum + b.netCents, 0)).toBe(totals.netCents);
		expect(totals.netCents).toBe(27000);
	});

	it('takes a PERCENT discount from the provided base (work subtotal), not the full net', () => {
		// Work €100 @21% + a surcharge €50 @21% → full net €150. Base = work €100 → 10% = €10 (not €15).
		const totals = computeQuoteTotals(
			[
				line({ quantity: '1', unitPriceEur: '100.00', vatRate: 21 }),
				line({ quantity: '1', unitPriceEur: '50.00', vatRate: 21 })
			],
			{ type: 'percent', value: 10 },
			10000
		);
		expect(totals.discountCents).toBe(1000);
		expect(totals.netCents).toBe(14000); // 15000 − 1000
		expect(totals.vatCents).toBe(2940); // 21% of 140
		expect(totals.grossCents).toBe(16940);
	});

	it('apportions a manual discount only across positive brackets when a rule discount made one net-negative', () => {
		// 9% labour €900 + 21% materials €50 + a rule "Korting" line −€95 @21% → 21% bracket net = −€45.
		const totals = computeQuoteTotals(
			[
				line({ quantity: '1', unitPriceEur: '900.00', vatRate: 9 }),
				line({ quantity: '1', unitPriceEur: '50.00', vatRate: 21 }),
				line({ quantity: '1', unitPriceEur: '-95.00', vatRate: 21 })
			],
			{ type: 'percent', value: 5 }
		);
		// preDiscountNet = 90000 − 4500 = 85500; 5% = 4275.
		expect(totals.discountCents).toBe(4275);
		// Net = 85500 − 4275 = 81225 EXACTLY — the invariant holds despite the negative bracket.
		expect(totals.netCents).toBe(81225);
		const byKey = Object.fromEntries(totals.brackets.map(b => [b.key, b]));
		// The discount hit the positive 9% bracket; the negative 21% bracket is left untouched.
		expect(byKey['9']).toMatchObject({ netCents: 85725 });
		expect(byKey['21']).toMatchObject({ netCents: -4500 });
	});
});

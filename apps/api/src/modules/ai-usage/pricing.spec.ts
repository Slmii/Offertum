import { calculateCostUsd, rateFor } from '@/modules/ai-usage/pricing';

describe('rateFor', () => {
	it('prices an alias by exact name', () => {
		expect(rateFor('gpt-4o-mini')).toMatchObject({ known: true, rate: { inputPerMillionUsd: 0.15 } });
	});

	// We pin dated snapshots in env. Without this, every pinned gpt-4o-mini call would be priced
	// at the unknown-model fallback (gpt-4o rates) and the dashboard would overstate spend ~17x.
	it('prices a dated snapshot like its alias', () => {
		expect(rateFor('gpt-4o-mini-2024-07-18')).toEqual(rateFor('gpt-4o-mini'));
		expect(rateFor('gpt-4o-2024-08-06')).toEqual(rateFor('gpt-4o'));
	});

	it('still flags a genuinely unknown model', () => {
		expect(rateFor('some-future-model').known).toBe(false);
		expect(rateFor('some-future-model-2027-01-01').known).toBe(false);
	});

	it('computes cost from the snapshot rate', () => {
		expect(calculateCostUsd('gpt-4o-mini-2024-07-18', 1_000_000, 0)).toBeCloseTo(0.15);
	});
});

import { describe, expect, it } from '@jest/globals';
import { resolveWinBaseline } from './win-baseline';

describe('resolveWinBaseline', () => {
	it('returns the trade prior exactly when there is no closed history', () => {
		expect(resolveWinBaseline({ wonCount: 0, lostCount: 0, tradePrior: 0.3 })).toBeCloseTo(0.3, 10);
	});

	it('shrinks toward the prior at small samples (1 win, 0 losses != 1.0)', () => {
		const b = resolveWinBaseline({ wonCount: 1, lostCount: 0, tradePrior: 0.3 });
		expect(b).toBeGreaterThan(0.3);
		expect(b).toBeLessThan(0.6);
	});

	it('converges toward the org true rate as the sample grows', () => {
		const b = resolveWinBaseline({ wonCount: 80, lostCount: 20, tradePrior: 0.3 });
		expect(b).toBeGreaterThan(0.7);
	});

	it('moves below the prior with a losing record', () => {
		const b = resolveWinBaseline({ wonCount: 1, lostCount: 30, tradePrior: 0.3 });
		expect(b).toBeLessThan(0.2);
	});
});

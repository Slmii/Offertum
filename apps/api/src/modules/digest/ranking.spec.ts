import { describe, expect, it } from '@jest/globals';
import { rankOpportunities, type RankableOpportunity, type RankingConfig } from './ranking';

const NOW = new Date('2026-06-05T08:00:00.000Z');
const CFG: RankingConfig = { winBaseline: 0.3, followUpCadenceDays: 4 };

const opp = (over: Partial<RankableOpportunity> = {}): RankableOpportunity => ({
	opportunityId: 'opp-1',
	customerName: 'Jansen',
	requestType: 'Badkamer',
	quoteNetEuros: 1000,
	firstResponseHours: 4,
	priorCheckInCount: 0,
	validUntil: new Date('2026-07-01T00:00:00.000Z'),
	customerDeadline: null,
	...over
});

describe('rankOpportunities', () => {
	it('orders by descending priority and assigns rank 1..n', () => {
		const ranked = rankOpportunities(
			[opp({ opportunityId: 'low', quoteNetEuros: 100 }), opp({ opportunityId: 'high', quoteNetEuros: 9000 })],
			CFG,
			NOW
		);
		expect(ranked.map(r => r.opportunityId)).toEqual(['high', 'low']);
		expect(ranked.map(r => r.rank)).toEqual([1, 2]);
	});

	it('bubbles an opp up when its expiry shrinks to 2 days (time pressure)', () => {
		const farther = opp({ opportunityId: 'far', validUntil: new Date('2026-07-01T00:00:00.000Z') });
		const expiring = opp({ opportunityId: 'soon', validUntil: new Date('2026-06-07T00:00:00.000Z') });
		const ranked = rankOpportunities([farther, expiring], CFG, NOW);
		expect(ranked[0]?.opportunityId).toBe('soon');
	});

	it('ranks a no-quote opp on winProbability × timePressure (value term = 0 does not zero priority)', () => {
		const ranked = rankOpportunities([opp({ opportunityId: 'noquote', quoteNetEuros: 0 })], CFG, NOW);
		expect(ranked[0]?.priority).toBeGreaterThan(0);
	});

	it('keeps winProbability within [0.02, 0.95] for extreme inputs', () => {
		// Current modifier tables stay within bounds; the clamp is defense-in-depth for future table changes.
		const ranked = rankOpportunities([opp({ priorCheckInCount: 99, firstResponseHours: 999 })], CFG, NOW);
		expect(ranked[0]?.winProbability).toBeGreaterThanOrEqual(0.02);
		expect(ranked[0]?.winProbability).toBeLessThanOrEqual(0.95);
	});

	it('clamps winProbability up to the 0.02 floor', () => {
		// winBaseline: 0.01 × responseTimeModifier(24h → 1.0) × followUpCountModifier(0 → 1.0) = 0.01 < 0.02 → clamps up.
		const cfg: RankingConfig = { winBaseline: 0.01, followUpCadenceDays: 4 };
		const ranked = rankOpportunities([opp({ firstResponseHours: 24, priorCheckInCount: 0 })], cfg, NOW);
		expect(ranked[0]?.winProbability).toBe(0.02);
	});

	it('clamps winProbability down to the 0.95 ceiling', () => {
		// winBaseline: 5 × 1.0 × 1.0 = 5 → clamps down to 0.95.
		const cfg: RankingConfig = { winBaseline: 5, followUpCadenceDays: 4 };
		const ranked = rankOpportunities([opp({ firstResponseHours: 24, priorCheckInCount: 0 })], cfg, NOW);
		expect(ranked[0]?.winProbability).toBe(0.95);
	});

	it('breaks priority ties by opportunityId for a stable order', () => {
		// Both opps have identical ranking inputs; tie-break is opportunityId.localeCompare.
		// Input is [b, a] order — output must be [a, b] with ranks [1, 2].
		const ranked = rankOpportunities(
			[
				opp({ opportunityId: 'b', quoteNetEuros: 1000, firstResponseHours: 4, priorCheckInCount: 0 }),
				opp({ opportunityId: 'a', quoteNetEuros: 1000, firstResponseHours: 4, priorCheckInCount: 0 })
			],
			CFG,
			NOW
		);
		expect(ranked.map(r => r.opportunityId)).toEqual(['a', 'b']);
		expect(ranked.map(r => r.rank)).toEqual([1, 2]);
	});
});

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { MIN_OPPORTUNITIES_FOR_PATTERNS } from './pattern-visibility';
import type { PatternsRepository } from './patterns.repository';
import { PatternsService } from './patterns.service';

const NOW = new Date('2026-06-09T00:00:00.000Z');

type RepositoryMock = jest.Mocked<
	Pick<
		PatternsRepository,
		| 'isOrganizationEntitled'
		| 'countOpportunities'
		| 'getFollowUpCadenceDays'
		| 'replySpeedStats'
		| 'winRateByResponseBucket'
		| 'findDismissals'
		| 'upsertDismissal'
	>
>;

// Fake repository — no module mocks, just a hand-rolled stand-in injected via DI.
// Entitlement defaults to true so the existing pattern-logic tests keep passing.
function createRepository(overrides: Partial<RepositoryMock> = {}): PatternsRepository {
	const base: RepositoryMock = {
		isOrganizationEntitled: jest.fn<PatternsRepository['isOrganizationEntitled']>(async () => true),
		countOpportunities: jest.fn<PatternsRepository['countOpportunities']>(async () => 0),
		getFollowUpCadenceDays: jest.fn<PatternsRepository['getFollowUpCadenceDays']>(async () => 5),
		replySpeedStats: jest.fn<PatternsRepository['replySpeedStats']>(async () => ({ avgCustomerReplyDays: null })),
		winRateByResponseBucket: jest.fn<PatternsRepository['winRateByResponseBucket']>(async () => ({
			fast: { wonCount: 0, lostCount: 0 },
			medium: { wonCount: 0, lostCount: 0 },
			slow: { wonCount: 0, lostCount: 0 }
		})),
		findDismissals: jest.fn<PatternsRepository['findDismissals']>(async () => new Map<string, Date>()),
		upsertDismissal: jest.fn<PatternsRepository['upsertDismissal']>(async () => undefined)
	};
	return { ...base, ...overrides } as unknown as PatternsRepository;
}

describe('PatternsService.getPatterns', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('returns no banners for a non-entitled org and skips the metric reads', async () => {
		const countOpportunities = jest.fn<PatternsRepository['countOpportunities']>(async () => 25);
		const replySpeedStats = jest.fn<PatternsRepository['replySpeedStats']>(async () => ({
			avgCustomerReplyDays: 2.3
		}));
		const repository = createRepository({
			isOrganizationEntitled: jest.fn<PatternsRepository['isOrganizationEntitled']>(async () => false),
			countOpportunities,
			replySpeedStats
		});
		const service = new PatternsService(repository);

		const banners = await service.getPatterns('org-1', 'user-1', NOW);

		expect(banners).toEqual([]);
		// Short-circuits before any metric work.
		expect(countOpportunities).not.toHaveBeenCalled();
		expect(replySpeedStats).not.toHaveBeenCalled();
	});

	it('returns nothing below the opportunity threshold', async () => {
		const repository = createRepository({
			countOpportunities: jest.fn<PatternsRepository['countOpportunities']>(
				async () => MIN_OPPORTUNITIES_FOR_PATTERNS - 1
			),
			replySpeedStats: jest.fn<PatternsRepository['replySpeedStats']>(async () => ({ avgCustomerReplyDays: 2 })),
			winRateByResponseBucket: jest.fn<PatternsRepository['winRateByResponseBucket']>(async () => ({
				fast: { wonCount: 8, lostCount: 2 },
				medium: { wonCount: 0, lostCount: 0 },
				slow: { wonCount: 1, lostCount: 9 }
			}))
		});
		const service = new PatternsService(repository);

		const banners = await service.getPatterns('org-1', 'user-1', NOW);

		expect(banners).toEqual([]);
	});

	it('returns both banners above threshold with sufficient data', async () => {
		const repository = createRepository({
			countOpportunities: jest.fn<PatternsRepository['countOpportunities']>(async () => 25),
			getFollowUpCadenceDays: jest.fn<PatternsRepository['getFollowUpCadenceDays']>(async () => 7),
			replySpeedStats: jest.fn<PatternsRepository['replySpeedStats']>(async () => ({
				avgCustomerReplyDays: 2.3
			})),
			winRateByResponseBucket: jest.fn<PatternsRepository['winRateByResponseBucket']>(async () => ({
				fast: { wonCount: 8, lostCount: 2 },
				medium: { wonCount: 0, lostCount: 0 },
				slow: { wonCount: 1, lostCount: 9 }
			}))
		});
		const service = new PatternsService(repository);

		const banners = await service.getPatterns('org-1', 'user-1', NOW);
		const keys = banners.map(b => b.patternKey);

		expect(keys).toContain('reply_speed');
		expect(keys).toContain('win_rate_by_speed');
		const winRate = banners.find(b => b.patternKey === 'win_rate_by_speed');
		// 8/10 = 80% fast vs 1/10 = 10% slow → speed-wins framing.
		expect(winRate?.detail).toContain('80%');
		expect(winRate?.detail).toContain('10%');
	});

	it('uses singular "dag" when the average rounds to exactly 1', async () => {
		const repository = createRepository({
			countOpportunities: jest.fn<PatternsRepository['countOpportunities']>(async () => 25),
			getFollowUpCadenceDays: jest.fn<PatternsRepository['getFollowUpCadenceDays']>(async () => 1),
			replySpeedStats: jest.fn<PatternsRepository['replySpeedStats']>(async () => ({
				avgCustomerReplyDays: 1.04
			}))
		});
		const service = new PatternsService(repository);

		const banners = await service.getPatterns('org-1', 'user-1', NOW);
		const replySpeed = banners.find(b => b.patternKey === 'reply_speed');

		expect(replySpeed?.headline).toBe('Klanten reageren gemiddeld binnen 1 dag');
		expect(replySpeed?.detail).toContain('1 dag ');
		expect(replySpeed?.detail).not.toContain('1 dagen');
	});

	it('renders a one-decimal Dutch average without double rounding', async () => {
		const repository = createRepository({
			countOpportunities: jest.fn<PatternsRepository['countOpportunities']>(async () => 25),
			replySpeedStats: jest.fn<PatternsRepository['replySpeedStats']>(async () => ({
				avgCustomerReplyDays: 2.349
			}))
		});
		const service = new PatternsService(repository);

		const banners = await service.getPatterns('org-1', 'user-1', NOW);
		const replySpeed = banners.find(b => b.patternKey === 'reply_speed');

		expect(replySpeed?.headline).toBe('Klanten reageren gemiddeld binnen 2,3 dagen');
	});

	it('hides a banner the user dismissed within the re-show window', async () => {
		const recent = new Date(NOW.getTime() - 86_400_000); // 1 day ago
		const repository = createRepository({
			countOpportunities: jest.fn<PatternsRepository['countOpportunities']>(async () => 25),
			replySpeedStats: jest.fn<PatternsRepository['replySpeedStats']>(async () => ({
				avgCustomerReplyDays: 2.3
			})),
			findDismissals: jest.fn<PatternsRepository['findDismissals']>(
				async () => new Map([['reply_speed', recent]])
			)
		});
		const service = new PatternsService(repository);

		const banners = await service.getPatterns('org-1', 'user-1', NOW);

		expect(banners.map(b => b.patternKey)).not.toContain('reply_speed');
	});

	it('dismiss upserts via the repository', async () => {
		const upsert = jest.fn<PatternsRepository['upsertDismissal']>(async () => undefined);
		const repository = createRepository({ upsertDismissal: upsert });
		const service = new PatternsService(repository);

		await service.dismiss('org-1', 'user-1', 'reply_speed', NOW);

		expect(upsert).toHaveBeenCalledWith('org-1', 'user-1', 'reply_speed', NOW);
	});
});

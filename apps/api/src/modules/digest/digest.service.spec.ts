import { NotificationEventType as PrismaNotificationEventType } from '@/generated/prisma/enums';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { DigestService } from './digest.service';
import type { DigestRepository } from './digest.repository';
import type { ExpiryRepository } from '@/modules/expiry/expiry.repository';
import type { RankableOpportunity } from './ranking';
import type { NotificationsService } from '@/modules/notifications/notifications.service';
import type { NotificationsRepository } from '@/modules/notifications/notifications.repository';
import type { LogService } from '@/modules/logger/log.service';

const NOW = new Date('2026-06-05T08:00:00.000Z');

// Three opps with widely-separated values and no dates → neutral time pressure for all,
// so ordering is driven purely by quoteNetEuros (descending). High → mid → low.
const rankable = (over: Partial<RankableOpportunity> = {}): RankableOpportunity => ({
	opportunityId: 'opp',
	customerName: 'Jansen',
	requestType: 'Badkamer',
	quoteNetEuros: 1000,
	firstResponseHours: 4,
	priorCheckInCount: 0,
	validUntil: null,
	customerDeadline: null,
	...over
});

const HIGH = rankable({ opportunityId: 'opp-high', customerName: 'Hoog', quoteNetEuros: 9000 });
const MID = rankable({ opportunityId: 'opp-mid', customerName: 'Midden', quoteNetEuros: 3000 });
const LOW = rankable({ opportunityId: 'opp-low', customerName: 'Laag', quoteNetEuros: 500 });

const USERS = [
	{ id: 'user-1', email: 'a@example.com', name: 'A' },
	{ id: 'user-2', email: 'b@example.com', name: 'B' }
];

interface Fakes {
	digestRepository: jest.Mocked<
		Pick<DigestRepository, 'findEntitledOrganizations' | 'findRankableOpportunities' | 'countClosedOutcomes'>
	>;
	expiryRepository: jest.Mocked<Pick<ExpiryRepository, 'findExpiringCallouts'>>;
	notifications: jest.Mocked<Pick<NotificationsService, 'notifyUsers' | 'webOrigin'>>;
	notificationsRepository: jest.Mocked<
		Pick<NotificationsRepository, 'findOrganizationUsers' | 'findUserIdsWithRecentDigest'>
	>;
	logService: jest.Mocked<Pick<LogService, 'logAction'>>;
}

function makeFakes(): Fakes {
	return {
		digestRepository: {
			findEntitledOrganizations: jest.fn(),
			findRankableOpportunities: jest.fn(),
			countClosedOutcomes: jest.fn()
		},
		expiryRepository: {
			findExpiringCallouts: jest.fn(async () => [])
		},
		notifications: {
			notifyUsers: jest.fn(async () => undefined),
			webOrigin: jest.fn(() => 'https://app.example.com')
		},
		notificationsRepository: {
			findOrganizationUsers: jest.fn(),
			findUserIdsWithRecentDigest: jest.fn()
		},
		logService: {
			logAction: jest.fn()
		}
	};
}

function makeService(fakes: Fakes): DigestService {
	return new DigestService(
		fakes.digestRepository as unknown as DigestRepository,
		fakes.expiryRepository as unknown as ExpiryRepository,
		fakes.notifications as unknown as NotificationsService,
		fakes.notificationsRepository as unknown as NotificationsRepository,
		fakes.logService as unknown as LogService
	);
}

describe('DigestService.runDailyDigest', () => {
	let fakes: Fakes;

	beforeEach(() => {
		fakes = makeFakes();
	});

	it('ranks + dispatches the top items in priority order to every org user', async () => {
		fakes.digestRepository.findEntitledOrganizations.mockResolvedValue([
			{ id: 'org-1', vertical: 'OVERIG', followUpCadenceDays: 4 }
		]);
		// Deliberately out of priority order in the input.
		fakes.digestRepository.findRankableOpportunities.mockResolvedValue([LOW, HIGH, MID]);
		fakes.digestRepository.countClosedOutcomes.mockResolvedValue({ wonCount: 5, lostCount: 3 });
		fakes.notificationsRepository.findOrganizationUsers.mockResolvedValue(USERS);
		fakes.notificationsRepository.findUserIdsWithRecentDigest.mockResolvedValue(new Set());

		const service = makeService(fakes);
		const result = await service.runDailyDigest(NOW);

		expect(fakes.notifications.notifyUsers).toHaveBeenCalledTimes(1);
		const arg = fakes.notifications.notifyUsers.mock.calls[0]![0];
		expect(arg.eventType).toBe(PrismaNotificationEventType.DAILY_DIGEST);
		expect(arg.userIds).toEqual(['user-1', 'user-2']);

		// Pure ranking applied: highest value first, lowest last. The rendered email lists
		// items top-to-bottom in priority order, so the names appear in the html in that order.
		const html = arg.email.html;
		const posHigh = html.indexOf('Hoog');
		const posMid = html.indexOf('Midden');
		const posLow = html.indexOf('Laag');
		expect(posHigh).toBeGreaterThanOrEqual(0);
		expect(posHigh).toBeLessThan(posMid);
		expect(posMid).toBeLessThan(posLow);

		expect(result).toEqual({ orgs: 1, recipients: 2, skippedDuplicate: 0 });
	});

	it('includes expiring callouts (with opportunity link) in the dispatched email', async () => {
		fakes.digestRepository.findEntitledOrganizations.mockResolvedValue([
			{ id: 'org-1', vertical: 'OVERIG', followUpCadenceDays: 4 }
		]);
		fakes.digestRepository.findRankableOpportunities.mockResolvedValue([HIGH]);
		fakes.digestRepository.countClosedOutcomes.mockResolvedValue({ wonCount: 0, lostCount: 0 });
		fakes.expiryRepository.findExpiringCallouts.mockResolvedValue([
			{ opportunityId: 'opp-expiring', customerName: 'Bakker', daysUntilExpiry: 3 }
		]);
		fakes.notificationsRepository.findOrganizationUsers.mockResolvedValue(USERS);
		fakes.notificationsRepository.findUserIdsWithRecentDigest.mockResolvedValue(new Set());

		const service = makeService(fakes);
		await service.runDailyDigest(NOW);

		expect(fakes.notifications.notifyUsers).toHaveBeenCalledTimes(1);
		const html = fakes.notifications.notifyUsers.mock.calls[0]![0].email.html;
		expect(html).toContain('Verloopt binnenkort');
		expect(html).toContain('Bakker — verloopt over 3 dagen');
		expect(html).toContain('https://app.example.com/opportunities/opp-expiring');
	});

	it('skips users already notified within the idempotency window', async () => {
		fakes.digestRepository.findEntitledOrganizations.mockResolvedValue([
			{ id: 'org-1', vertical: 'OVERIG', followUpCadenceDays: 4 }
		]);
		fakes.digestRepository.findRankableOpportunities.mockResolvedValue([HIGH, MID]);
		fakes.digestRepository.countClosedOutcomes.mockResolvedValue({ wonCount: 0, lostCount: 0 });
		fakes.notificationsRepository.findOrganizationUsers.mockResolvedValue(USERS);
		fakes.notificationsRepository.findUserIdsWithRecentDigest.mockResolvedValue(new Set(['user-1', 'user-2']));

		const service = makeService(fakes);
		const result = await service.runDailyDigest(NOW);

		expect(fakes.notifications.notifyUsers).not.toHaveBeenCalled();
		expect(result).toEqual({ orgs: 1, recipients: 0, skippedDuplicate: 2 });
	});

	it('caps the digest at 5 ranked items but sums open value across all', async () => {
		// Six opps with distinct, deterministic values so ranking order is unambiguous.
		// All have no dates → neutral time pressure, so quoteNetEuros drives rank.
		const SIX = [
			rankable({ opportunityId: 'opp-1', customerName: 'Eerste', quoteNetEuros: 9000 }),
			rankable({ opportunityId: 'opp-2', customerName: 'Tweede', quoteNetEuros: 7000 }),
			rankable({ opportunityId: 'opp-3', customerName: 'Derde', quoteNetEuros: 5000 }),
			rankable({ opportunityId: 'opp-4', customerName: 'Vierde', quoteNetEuros: 3000 }),
			rankable({ opportunityId: 'opp-5', customerName: 'Vijfde', quoteNetEuros: 1000 }),
			rankable({ opportunityId: 'opp-6', customerName: 'Zesde', quoteNetEuros: 500 })
		];
		const expectedTotal = 9000 + 7000 + 5000 + 3000 + 1000 + 500; // 25500

		fakes.digestRepository.findEntitledOrganizations.mockResolvedValue([
			{ id: 'org-1', vertical: 'OVERIG', followUpCadenceDays: 4 }
		]);
		fakes.digestRepository.findRankableOpportunities.mockResolvedValue(SIX);
		fakes.digestRepository.countClosedOutcomes.mockResolvedValue({ wonCount: 5, lostCount: 3 });
		fakes.notificationsRepository.findOrganizationUsers.mockResolvedValue(USERS);
		fakes.notificationsRepository.findUserIdsWithRecentDigest.mockResolvedValue(new Set());

		const service = makeService(fakes);
		await service.runDailyDigest(NOW);

		expect(fakes.notifications.notifyUsers).toHaveBeenCalledTimes(1);
		const call = fakes.notifications.notifyUsers.mock.calls[0]![0];

		// Exactly 5 items in the rendered email — the 6th ("Zesde") must not appear.
		const html = call.email.html;
		expect(html).toContain('Eerste');
		expect(html).toContain('Vijfde');
		expect(html).not.toContain('Zesde');

		// The metadata `ranked` field reflects only the top-5 slice.
		expect(call.metadata).toMatchObject({ ranked: 5 });

		// totalOpenValueEuros in the metadata sums ALL 6 opps, not just the top 5.
		expect(call.metadata).toMatchObject({ totalOpenValueEuros: expectedTotal });
	});

	it('does not dispatch and does not crash for an empty org', async () => {
		fakes.digestRepository.findEntitledOrganizations.mockResolvedValue([
			{ id: 'org-1', vertical: 'OVERIG', followUpCadenceDays: 4 }
		]);
		fakes.digestRepository.findRankableOpportunities.mockResolvedValue([]);
		fakes.digestRepository.countClosedOutcomes.mockResolvedValue({ wonCount: 0, lostCount: 0 });
		fakes.notificationsRepository.findOrganizationUsers.mockResolvedValue([]);
		fakes.notificationsRepository.findUserIdsWithRecentDigest.mockResolvedValue(new Set());

		const service = makeService(fakes);
		const result = await service.runDailyDigest(NOW);

		expect(fakes.notifications.notifyUsers).not.toHaveBeenCalled();
		expect(result).toEqual({ orgs: 1, recipients: 0, skippedDuplicate: 0 });
	});
});

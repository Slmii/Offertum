// apps/api/src/modules/calendar/calendar.service.spec.ts
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { EnvSchema } from '@/config/env.schema';
import type { CalendarRepository } from './calendar.repository';
import { CalendarService } from './calendar.service';

const ORG_CFG = { quoteValidityDays: 30, followUpCadenceDays: 4, followUpMaxCount: 2 };

function makeRepo(overrides: Partial<jest.Mocked<CalendarRepository>> = {}): jest.Mocked<CalendarRepository> {
	return {
		findActiveSources: jest.fn<CalendarRepository['findActiveSources']>().mockResolvedValue([]),
		findOrgCalendarConfig: jest.fn<CalendarRepository['findOrgCalendarConfig']>().mockResolvedValue(ORG_CFG),
		findUserByIcalToken: jest.fn<CalendarRepository['findUserByIcalToken']>().mockResolvedValue(null),
		setIcalToken: jest.fn<CalendarRepository['setIcalToken']>().mockResolvedValue(undefined),
		findIcalToken: jest.fn<CalendarRepository['findIcalToken']>().mockResolvedValue(null),
		isOrganizationEntitled: jest.fn<CalendarRepository['isOrganizationEntitled']>().mockResolvedValue(true),
		...overrides
	} as unknown as jest.Mocked<CalendarRepository>;
}

function makeConfig(webOrigin = 'https://app.offertum.test'): ConfigService<EnvSchema, true> {
	return { get: jest.fn(() => webOrigin) } as unknown as ConfigService<EnvSchema, true>;
}

describe('CalendarService', () => {
	let repo: jest.Mocked<CalendarRepository>;

	beforeEach(() => {
		repo = makeRepo();
	});

	describe('getEvents', () => {
		it('filters mapped events to the [from, to] window', async () => {
			repo.findActiveSources.mockResolvedValue([
				{
					opportunityId: 'opp-1',
					status: 'NEW',
					dismissedAt: null,
					customerName: 'Jansen',
					customerDeadline: new Date('2026-06-15T00:00:00.000Z'), // in window
					customerAppointment: new Date('2026-09-01T00:00:00.000Z'), // out of window
					currentQuoteDraft: null,
					latestSentQuoteDraft: null,
					latestSentReplyDraftAt: null,
					priorCheckInCount: 0
				}
			]);
			const service = new CalendarService(repo, makeConfig());
			const events = await service.getEvents('org-1', {
				scope: 'all',
				requestingUserId: 'u1',
				from: new Date('2026-06-01'),
				to: new Date('2026-06-30')
			});
			expect(events.map(e => e.type)).toEqual(['deadline']);
		});

		it('returns [] when the org has no calendar config', async () => {
			repo.findOrgCalendarConfig.mockResolvedValue(null);
			const service = new CalendarService(repo, makeConfig());
			const events = await service.getEvents('org-1', {
				scope: 'all',
				requestingUserId: null,
				from: new Date('2026-06-01'),
				to: new Date('2026-06-30')
			});
			expect(events).toEqual([]);
		});
	});

	describe('feed token lifecycle', () => {
		it('generateFeedToken writes a token and returns its absolute URL', async () => {
			const service = new CalendarService(repo, makeConfig());
			const result = await service.generateFeedToken('user-1');
			expect(repo.setIcalToken).toHaveBeenCalledWith('user-1', expect.any(String));
			expect(result.url).toMatch(/^https:\/\/app\.offertum\.test\/api\/calendar\/ical\/[A-Za-z0-9_-]+\.ics$/);
		});

		it('revokeFeedToken clears the token and returns a null url', async () => {
			const service = new CalendarService(repo, makeConfig());
			const result = await service.revokeFeedToken('user-1');
			expect(repo.setIcalToken).toHaveBeenCalledWith('user-1', null);
			expect(result.url).toBeNull();
		});

		it('getFeedToken returns the existing url, or null when disabled', async () => {
			repo.findIcalToken.mockResolvedValue('existing-token');
			const service = new CalendarService(repo, makeConfig());
			expect((await service.getFeedToken('user-1')).url).toBe(
				'https://app.offertum.test/api/calendar/ical/existing-token.ics'
			);
			repo.findIcalToken.mockResolvedValue(null);
			expect((await service.getFeedToken('user-1')).url).toBeNull();
		});
	});

	describe('renderFeed', () => {
		it('throws NotFound for an unknown token', async () => {
			const service = new CalendarService(repo, makeConfig());
			await expect(service.renderFeed('nope')).rejects.toBeInstanceOf(NotFoundException);
		});

		it('serves events for an entitled org', async () => {
			repo.findUserByIcalToken.mockResolvedValue({ id: 'user-1', currentOrganizationId: 'org-1' });
			repo.isOrganizationEntitled.mockResolvedValue(true);
			repo.findActiveSources.mockResolvedValue([
				{
					opportunityId: 'opp-1',
					status: 'NEW',
					dismissedAt: null,
					customerName: 'Jansen',
					customerDeadline: new Date(),
					customerAppointment: null,
					currentQuoteDraft: null,
					latestSentQuoteDraft: null,
					latestSentReplyDraftAt: null,
					priorCheckInCount: 0
				}
			]);
			const service = new CalendarService(repo, makeConfig());
			const ics = await service.renderFeed('valid-token');
			expect(ics).toContain('BEGIN:VEVENT');
			expect(ics).toContain('Deadline klant — Jansen');
		});

		it('returns a valid but empty calendar when the org is not entitled', async () => {
			repo.findUserByIcalToken.mockResolvedValue({ id: 'user-1', currentOrganizationId: 'org-1' });
			repo.isOrganizationEntitled.mockResolvedValue(false);
			repo.findActiveSources.mockResolvedValue([
				{
					opportunityId: 'opp-1',
					status: 'NEW',
					dismissedAt: null,
					customerName: 'Jansen',
					customerDeadline: new Date(),
					customerAppointment: null,
					currentQuoteDraft: null,
					latestSentQuoteDraft: null,
					latestSentReplyDraftAt: null,
					priorCheckInCount: 0
				}
			]);
			const service = new CalendarService(repo, makeConfig());
			const ics = await service.renderFeed('valid-token');
			expect(ics).toContain('BEGIN:VCALENDAR');
			expect(ics).not.toContain('BEGIN:VEVENT');
			// Entitlement short-circuits before the event scan.
			expect(repo.findActiveSources).not.toHaveBeenCalled();
		});
	});
});

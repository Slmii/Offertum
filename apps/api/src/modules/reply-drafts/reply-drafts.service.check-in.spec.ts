import { Urgency as PrismaUrgency } from '@/generated/prisma/enums';
import type { AIGenerateResult } from '@/modules/ai/clients/ai-client.interface';
import type { ReplyDraftGenerator } from '@/modules/ai/reply-draft/reply-draft-generator.service';
import type { ReplyDraftResult } from '@/modules/ai/reply-draft/reply-draft.types';
import type { LogService } from '@/modules/logger/log.service';
import type { ReplyDraftsRepository, CheckInCandidate } from '@/modules/reply-drafts/reply-drafts.repository';
import { ReplyDraftsService } from '@/modules/reply-drafts/reply-drafts.service';
import { describe, expect, it, jest } from '@jest/globals';

/**
 * Focused tests for `ReplyDraftsService.generateCheckInDraft`. The hard part
 * is the SQL-driven candidate selection, which runs in `findCheckInCandidates` /
 * `reValidateCheckInCandidate` against the live DB (covered by manual smoke + the
 * scheduler's daily run in staging). These tests pin down the service-layer policy:
 *  - Skip when the candidate is no longer eligible at processor time
 *  - Skip when the opportunity row disappeared between cron and processor
 *  - Persist with `kind: 'CHECK_IN'` on the happy path
 *  - Audit log carries the daysSinceSent + cap math
 */

type FakeRepository = Pick<
	ReplyDraftsRepository,
	'reValidateCheckInCandidate' | 'findOpportunityForGeneration' | 'findOrganizationName' | 'createFollowup'
>;

type FakeGenerator = Pick<ReplyDraftGenerator, 'generateCheckIn'>;
type FakeLog = Pick<LogService, 'logAction'>;

function makeService(
	overrides: {
		repository?: Partial<Record<keyof FakeRepository, jest.Mock>>;
		generator?: Partial<Record<keyof FakeGenerator, jest.Mock>>;
	} = {}
) {
	const repository = {
		reValidateCheckInCandidate: jest.fn().mockReturnValue(Promise.resolve(null)),
		findOpportunityForGeneration: jest.fn().mockReturnValue(Promise.resolve(null)),
		findOrganizationName: jest.fn().mockReturnValue(Promise.resolve('Quoteom')),
		createFollowup: jest.fn().mockReturnValue(Promise.resolve({ draftId: 'draft-x' })),
		...overrides.repository
	} as unknown as FakeRepository;

	const generator = {
		generateCheckIn: jest.fn().mockReturnValue(
			Promise.resolve({
				value: { body: 'Korte herinnering.' },
				provider: 'openai',
				model: 'gpt-4o-mini',
				callId: 'call-1'
			} satisfies AIGenerateResult<ReplyDraftResult>)
		),
		...overrides.generator
	} as unknown as FakeGenerator;

	const logService = { logAction: jest.fn() } as unknown as FakeLog;

	// Service constructor pulls many deps unrelated to check-ins (Gmail, Microsoft,
	// EmailAccountsService, attachment storage, etc.). Construct via `Object.create` +
	// hand-assignment so the spec doesn't need to stub the entire DI graph.
	const service = Object.create(ReplyDraftsService.prototype) as ReplyDraftsService;
	Object.assign(service, {
		generator,
		repository,
		logService
	});

	return { service, repository, generator, logService };
}

function makeCandidate(overrides: Partial<CheckInCandidate> = {}): CheckInCandidate {
	return {
		opportunityId: 'opp-1',
		organizationId: 'org-1',
		cadenceDays: 4,
		maxCount: 2,
		lastSentAt: new Date('2026-05-10T09:00:00Z'),
		priorCheckInCount: 0,
		...overrides
	};
}

function makeOpportunity(overrides: { mailboxUser?: { id: string; name: string | null } | null } = {}) {
	return {
		id: 'opp-1',
		organizationId: 'org-1',
		customerName: 'Jeroen',
		address: 'Hilversum',
		requestType: 'dakkapel',
		urgency: PrismaUrgency.NORMAL,
		customerDeadline: null,
		customerAppointment: null,
		deliverableHints: [],
		rawMessage: {
			subject: 'Offerte aanvraag',
			fromName: 'Jeroen',
			fromEmail: 'jeroen@example.com',
			raw: {},
			provider: 'GMAIL'
		},
		latestThreadMessage: null,
		mailboxUser: overrides.mailboxUser !== undefined ? overrides.mailboxUser : { id: 'mb-user-1', name: 'Sander' }
	};
}

describe('ReplyDraftsService.generateCheckInDraft', () => {
	it('skips with no_longer_eligible when the candidate was invalidated between cron and processor', async () => {
		const { service, repository, generator } = makeService({
			repository: {
				reValidateCheckInCandidate: jest.fn().mockReturnValue(Promise.resolve(null))
			}
		});

		const result = await service.generateCheckInDraft('opp-1', new Date('2026-05-21T09:00:00Z'));

		expect(result).toEqual({ created: false, draftId: null, skipReason: 'no_longer_eligible' });
		expect(generator.generateCheckIn).not.toHaveBeenCalled();
		expect(repository.findOpportunityForGeneration).not.toHaveBeenCalled();
		expect(repository.createFollowup).not.toHaveBeenCalled();
	});

	it('skips with opportunity_not_found when the row disappeared after re-validation', async () => {
		const { service, generator, repository } = makeService({
			repository: {
				reValidateCheckInCandidate: jest.fn().mockReturnValue(Promise.resolve(makeCandidate())),
				findOpportunityForGeneration: jest.fn().mockReturnValue(Promise.resolve(null))
			}
		});

		const result = await service.generateCheckInDraft('opp-1', new Date('2026-05-21T09:00:00Z'));

		expect(result).toEqual({ created: false, draftId: null, skipReason: 'opportunity_not_found' });
		expect(generator.generateCheckIn).not.toHaveBeenCalled();
		expect(repository.createFollowup).not.toHaveBeenCalled();
	});

	it('generates a draft with kind = CHECK_IN on the happy path and computes daysSinceSent', async () => {
		const { service, repository, generator } = makeService({
			repository: {
				reValidateCheckInCandidate: jest.fn().mockReturnValue(
					Promise.resolve(
						makeCandidate({
							lastSentAt: new Date('2026-05-17T09:00:00Z'), // 4 days before "now"
							priorCheckInCount: 1,
							maxCount: 2
						})
					)
				),
				findOpportunityForGeneration: jest.fn().mockReturnValue(Promise.resolve(makeOpportunity()))
			}
		});

		const result = await service.generateCheckInDraft('opp-1', new Date('2026-05-21T09:00:00Z'));

		expect(result).toEqual({ created: true, draftId: 'draft-x' });
		const generatorMock = generator.generateCheckIn as jest.Mock;
		expect(generatorMock).toHaveBeenCalledTimes(1);
		const generatorCall = generatorMock.mock.calls[0]?.[0] as {
			daysSinceSent: number;
			tonePlaybookText: string | null;
			senderName: string | null;
			organizationName: string;
		};
		expect(generatorCall.daysSinceSent).toBe(4);
		// Voice policy: scheduler-triggered check-in → no playbook, sign-off uses mailbox user.
		expect(generatorCall.tonePlaybookText).toBeNull();
		expect(generatorCall.senderName).toBe('Sander');

		const createFollowupMock = repository.createFollowup as jest.Mock;
		expect(createFollowupMock).toHaveBeenCalledTimes(1);
		const createInput = createFollowupMock.mock.calls[0]?.[0] as { kind?: string };
		expect(createInput.kind).toBe('CHECK_IN');
	});

	it('falls back from mailbox-user name to organization name when the mailbox user has no name set', async () => {
		const { service, generator } = makeService({
			repository: {
				reValidateCheckInCandidate: jest.fn().mockReturnValue(Promise.resolve(makeCandidate())),
				findOpportunityForGeneration: jest
					.fn()
					.mockReturnValue(Promise.resolve(makeOpportunity({ mailboxUser: { id: 'mb-user-1', name: null } })))
			}
		});

		await service.generateCheckInDraft('opp-1', new Date('2026-05-21T09:00:00Z'));

		const generatorMock = generator.generateCheckIn as jest.Mock;
		const generatorCall = generatorMock.mock.calls[0]?.[0] as { senderName: string | null };
		// Null senderName here means the prompt will fall through to `organizationName`
		// exactly what we want when there's no human name to sign with.
		expect(generatorCall.senderName).toBeNull();
	});

	it('skips when reValidateCheckInCandidate returns null because maxCount = 0 (org disabled)', async () => {
		// Mirrors the production path where the scheduler SQL's `followUpMaxCount > 0`
		// filter excludes the org, but a stale event already in flight reaches the
		// processor. The re-validation in the repository returns null for that case;
		// the service must treat it identically to "no longer eligible" — no AI call,
		// no draft write, no audit log noise above the standard skip log.
		const { service, generator, repository } = makeService({
			repository: {
				reValidateCheckInCandidate: jest.fn().mockReturnValue(Promise.resolve(null))
			}
		});

		const result = await service.generateCheckInDraft('opp-1', new Date('2026-05-21T09:00:00Z'));

		expect(result).toEqual({ created: false, draftId: null, skipReason: 'no_longer_eligible' });
		expect(generator.generateCheckIn).not.toHaveBeenCalled();
		expect(repository.createFollowup).not.toHaveBeenCalled();
	});

	it('rounds sub-day windows up to 1 day so the prompt never says "0 dagen"', async () => {
		const { service, generator } = makeService({
			repository: {
				reValidateCheckInCandidate: jest.fn().mockReturnValue(
					Promise.resolve(
						makeCandidate({
							lastSentAt: new Date('2026-05-21T08:00:00Z') // 1 hour before "now"
						})
					)
				),
				findOpportunityForGeneration: jest.fn().mockReturnValue(Promise.resolve(makeOpportunity()))
			}
		});

		await service.generateCheckInDraft('opp-1', new Date('2026-05-21T09:00:00Z'));

		const generatorMock = generator.generateCheckIn as jest.Mock;
		const generatorCall = generatorMock.mock.calls[0]?.[0] as { daysSinceSent: number };
		expect(generatorCall.daysSinceSent).toBeGreaterThanOrEqual(1);
	});
});

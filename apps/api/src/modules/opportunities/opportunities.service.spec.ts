import { OpportunityStatus as PrismaOpportunityStatus, Urgency as PrismaUrgency } from '@/generated/prisma/enums';
import type { AIGenerateResult } from '@/modules/ai/clients/ai-client.interface';
import type { ClassifierResult } from '@/modules/ai/classifier/classifier.types';
import type { ClassifierService } from '@/modules/ai/classifier/classifier.service';
import type { ExtractorResult } from '@/modules/ai/extractor/extractor.types';
import type { ExtractorService } from '@/modules/ai/extractor/extractor.service';
import type { OpportunitiesRepository } from '@/modules/opportunities/opportunities.repository';
import type {
	OpportunityRecord,
	RawMessageForOpportunityProcessing
} from '@/modules/opportunities/opportunities.repository';
import { OpportunitiesService } from '@/modules/opportunities/opportunities.service';
import { describe, expect, it, jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

type FakeRepository = Pick<
	OpportunitiesRepository,
	| 'findPendingRawMessagesForAccount'
	| 'findOrganizationEmailAddresses'
	| 'markRawMessageNegative'
	| 'createOpportunityFromRawMessage'
	| 'findByIdForOrganization'
	| 'updateStatus'
	| 'listByOrganization'
	| 'countByStatusForOrganization'
	| 'findLatestEditorPerOpportunity'
	| 'findUserDisplayLabels'
>;

const EMPTY_STATUS_COUNTS = {
	NEW: 0,
	REPLIED: 0,
	WAITING: 0,
	COLD: 0,
	WON: 0,
	LOST: 0
};

function makeRepository(overrides: Partial<Record<keyof FakeRepository, jest.Mock>> = {}): FakeRepository {
	return {
		findPendingRawMessagesForAccount: jest.fn().mockReturnValue(Promise.resolve([])),
		// self-email filter source. Default empty so the existing tests
		// (which use external `fromEmail` addresses) fall through to the classifier
		// path as before. Tests that exercise the filter override this mock explicitly.
		findOrganizationEmailAddresses: jest.fn().mockReturnValue(Promise.resolve(new Set<string>())),
		markRawMessageNegative: jest.fn().mockReturnValue(Promise.resolve()),
		createOpportunityFromRawMessage: jest.fn().mockReturnValue(
			Promise.resolve({
				created: true,
				opportunityId: 'opp-created-1',
				mailbox: { email: 'inbox@example.com', userId: 'mailbox-user-1', ownerName: 'Mailbox Owner' }
			})
		),
		findByIdForOrganization: jest.fn().mockReturnValue(Promise.resolve(null)),
		updateStatus: jest.fn(),
		listByOrganization: jest.fn().mockReturnValue(Promise.resolve([])),
		countByStatusForOrganization: jest.fn().mockReturnValue(Promise.resolve(EMPTY_STATUS_COUNTS)),
		findLatestEditorPerOpportunity: jest.fn().mockReturnValue(Promise.resolve(new Map())),
		findUserDisplayLabels: jest.fn().mockReturnValue(Promise.resolve(new Map())),
		...overrides
	} as unknown as FakeRepository;
}

function wrapClassifier(value: ClassifierResult, overrides: Partial<AIGenerateResult<ClassifierResult>> = {}) {
	return {
		value,
		provider: 'openai',
		model: 'gpt-4o-mini',
		callId: 'classifier-call-id',
		...overrides
	} satisfies AIGenerateResult<ClassifierResult>;
}

function wrapExtractor(value: ExtractorResult, overrides: Partial<AIGenerateResult<ExtractorResult>> = {}) {
	return {
		value,
		provider: 'openai',
		model: 'gpt-4o',
		callId: 'extractor-call-id',
		...overrides
	} satisfies AIGenerateResult<ExtractorResult>;
}

function makeService(
	opts: {
		repository?: FakeRepository;
		classifier?: unknown;
		extractor?: unknown;
		configValues?: Record<string, unknown>;
	} = {}
): OpportunitiesService {
	const configValues = opts.configValues ?? {};
	const config = {
		get: jest.fn().mockImplementation((key: unknown) => configValues[key as string])
	} as unknown as ConfigService;

	return new OpportunitiesService(
		(opts.repository ?? makeRepository()) as OpportunitiesRepository,
		(opts.classifier ?? {
			classify: jest
				.fn()
				.mockReturnValue(
					Promise.resolve(wrapClassifier({ isQuote: false, confidence: 0.9, reason: 'Geen offerte' }))
				)
		}) as unknown as ClassifierService,
		(opts.extractor ?? {
			extract: jest.fn().mockReturnValue(
				Promise.resolve(
					wrapExtractor({
						customerName: 'Alice',
						customerEmail: 'alice@example.com',
						address: 'Utrecht',
						requestType: 'CV-ketel vervangen',
						urgency: 'normal',
						customerDeadline: '2026-06-01',
						customerAppointment: null,
						deliverableHints: ['CV-ketel']
					})
				)
			)
		}) as unknown as ExtractorService,
		config as unknown as ConfigService<never, true>,
		{ logAction: jest.fn() } as unknown as ConstructorParameters<typeof OpportunitiesService>[4],
		{
			regenerate: jest.fn().mockReturnValue(Promise.resolve({ overwrote: true, opportunityFound: true })),
			send: jest
				.fn()
				.mockReturnValue(Promise.resolve({ sent: true, sentAt: new Date('2026-05-19T14:00:00.000Z') }))
		} as unknown as ConstructorParameters<typeof OpportunitiesService>[5],
		{
			notifyUsers: jest.fn().mockReturnValue(Promise.resolve()),
			webOrigin: jest.fn().mockReturnValue('http://localhost:3000')
		} as unknown as ConstructorParameters<typeof OpportunitiesService>[6],
		{
			classify: jest.fn().mockReturnValue(
				Promise.resolve({
					value: { shouldReply: true, confidence: 0.9, reason: 'Test default — draft anyway' },
					provider: 'openai',
					model: 'gpt-4o-mini',
					callId: 'should-reply-call-1'
				})
			)
		} as unknown as ConstructorParameters<typeof OpportunitiesService>[7]
	);
}

const RAW_MESSAGE: RawMessageForOpportunityProcessing = {
	id: 'raw-1',
	emailAccountId: 'email-account-1',
	organizationId: 'org-1',
	internalDate: new Date('2026-05-17T10:00:00.000Z'),
	subject: 'Offerte',
	fromEmail: 'alice@example.com',
	fromName: 'Alice',
	// null so the thread-reconstitution branch falls through to the classifier
	// path. Tests that exercise thread reconstitution explicitly set this themselves.
	threadId: null,
	raw: {
		bodyPreview: 'Graag ontvang ik een offerte',
		body: { contentType: 'text', content: 'Graag ontvang ik een offerte' }
	},
	provider: 'MICROSOFT'
};

function makeOpportunityRecord(status: PrismaOpportunityStatus): OpportunityRecord {
	return {
		id: 'opp-1',
		organizationId: 'org-1',
		emailAccountId: 'email-account-1',
		rawMessageId: 'raw-1',
		latestCustomerRawMessageId: 'raw-1',
		status,
		aiProvider: 'openai/gpt-4o',
		classifiedAiCallId: 'classifier-call-id',
		extractedAiCallId: 'extractor-call-id',
		classifierConfidence: 0.9,
		classifierReason: 'Offerte aanvraag',
		customerName: 'Alice',
		customerEmail: 'alice@example.com',
		address: 'Utrecht',
		requestType: 'CV-ketel vervangen',
		urgency: PrismaUrgency.NORMAL,
		customerDeadline: new Date('2026-06-01T00:00:00.000Z'),
		customerAppointment: null,
		deliverableHints: ['CV-ketel'],
		dismissedAt: null,
		dismissReason: null,
		dismissedById: null,
		assignedToUserId: null,
		createdAt: new Date('2026-05-17T10:01:00.000Z'),
		updatedAt: new Date('2026-05-17T10:01:00.000Z'),
		rawMessage: {
			internalDate: new Date('2026-05-17T10:00:00.000Z'),
			subject: 'Offerte',
			fromEmail: 'alice@example.com',
			fromName: 'Alice',
			threadId: 'thread-1'
		},
		//  follow-up — `OPPORTUNITY_INCLUDE` now joins reply-draft scalars used by the
		// editability guard + `replyDraftSentAt` wire field. flipped this to 1:N —
		// default to an empty array so the unchanged transition tests still pass.
		replyDrafts: [],
		threadMessages: []
	};
}

describe('OpportunitiesService.processRawMessagesForAccount', () => {
	it('marks negative classifier results without calling the extractor', async () => {
		const repository = makeRepository({
			findPendingRawMessagesForAccount: jest
				.fn()
				.mockReturnValueOnce(Promise.resolve([RAW_MESSAGE]))
				.mockReturnValueOnce(Promise.resolve([]))
		});
		const extractor = { extract: jest.fn() };
		const service = makeService({ repository, extractor });

		const result = await service.processRawMessagesForAccount('email-account-1');

		expect(result).toMatchObject({ scanned: 1, classifiedNegative: 1, opportunitiesCreated: 0, failed: 0 });
		expect(repository.markRawMessageNegative).toHaveBeenCalledWith('raw-1');
		expect(extractor.extract).not.toHaveBeenCalled();
	});

	it('creates one opportunity and persists the AICall FK + composite provider/model', async () => {
		const repository = makeRepository({
			findPendingRawMessagesForAccount: jest
				.fn()
				.mockReturnValueOnce(Promise.resolve([RAW_MESSAGE]))
				.mockReturnValueOnce(Promise.resolve([]))
		});
		const classifier = {
			classify: jest
				.fn()
				.mockReturnValue(
					Promise.resolve(
						wrapClassifier(
							{ isQuote: true, confidence: 0.97, reason: 'Offerte' },
							{ callId: 'classifier-call-abc' }
						)
					)
				)
		};
		const extractor = {
			extract: jest.fn().mockReturnValue(
				Promise.resolve(
					wrapExtractor(
						{
							customerName: 'Alice',
							customerEmail: 'alice@example.com',
							address: 'Utrecht',
							requestType: 'CV-ketel vervangen',
							urgency: 'high',
							customerDeadline: '2026-06-01',
							customerAppointment: '2026-05-20',
							deliverableHints: ['CV-ketel']
						},
						{ provider: 'azure-openai', model: 'gpt-4o', callId: 'extractor-call-xyz' }
					)
				)
			)
		};
		const service = makeService({ repository, classifier, extractor });

		const result = await service.processRawMessagesForAccount('email-account-1');

		expect(result).toMatchObject({ scanned: 1, classifiedPositive: 1, opportunitiesCreated: 1, failed: 0 });
		expect(extractor.extract).toHaveBeenCalledWith(
			expect.objectContaining({ bodyText: 'Graag ontvang ik een offerte' }),
			'2026-05-17'
		);
		expect(repository.createOpportunityFromRawMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				rawMessage: RAW_MESSAGE,
				aiProvider: 'azure-openai/gpt-4o',
				classifiedAiCallId: 'classifier-call-abc',
				extractedAiCallId: 'extractor-call-xyz',
				classification: expect.objectContaining({ isQuote: true }),
				extraction: expect.objectContaining({ requestType: 'CV-ketel vervangen' })
			})
		);
	});

	it('leaves a positive RawMessage unclassified when extraction fails so a later run can retry', async () => {
		const repository = makeRepository({
			findPendingRawMessagesForAccount: jest.fn().mockImplementation((...args: unknown[]) => {
				const excluded = args[2] as string[];
				return Promise.resolve(excluded.includes('raw-1') ? [] : [RAW_MESSAGE]);
			})
		});
		const service = makeService({
			repository,
			classifier: {
				classify: jest
					.fn()
					.mockReturnValue(
						Promise.resolve(wrapClassifier({ isQuote: true, confidence: 0.9, reason: 'Offerte' }))
					)
			},
			extractor: { extract: jest.fn().mockImplementation(() => Promise.reject(new Error('extractor down'))) }
		});

		const result = await service.processRawMessagesForAccount('email-account-1');

		expect(result).toMatchObject({ scanned: 1, failed: 1, opportunitiesCreated: 0 });
		expect(repository.markRawMessageNegative).not.toHaveBeenCalled();
		expect(repository.createOpportunityFromRawMessage).not.toHaveBeenCalled();
	});
});

describe('OpportunitiesService.list pagination', () => {
	it('returns nextCursor when there is another page and slices to the requested limit', async () => {
		const first = makeOpportunityRecord(PrismaOpportunityStatus.NEW);
		const second: OpportunityRecord = {
			...first,
			id: 'opp-2',
			createdAt: new Date('2026-05-17T09:00:00.000Z'),
			updatedAt: new Date('2026-05-17T09:00:00.000Z')
		};
		const third: OpportunityRecord = {
			...first,
			id: 'opp-3',
			createdAt: new Date('2026-05-17T08:00:00.000Z'),
			updatedAt: new Date('2026-05-17T08:00:00.000Z')
		};
		const repository = makeRepository({
			// Service over-fetches by one row (take = limit + 1) to detect a next page.
			listByOrganization: jest.fn().mockReturnValue(Promise.resolve([first, second, third]))
		});
		const service = makeService({ repository });

		const list = await service.list('org-1', {
			cursor: null,
			limit: 2,
			status: null,
			search: null,
			dismissed: null,
			owner: null,
			assignee: null,
			hasReplies: null,
			urgency: null,
			deadline: null,
			pendingFollowup: null,
			hasAppointment: null,
			requestingUserId: null
		});

		expect(list.opportunities).toHaveLength(2);
		expect(list.opportunities[0]?.id).toBe('opp-1');
		expect(list.opportunities[1]?.id).toBe('opp-2');
		expect(list.nextCursor).not.toBeNull();
		expect(repository.listByOrganization).toHaveBeenCalledWith('org-1', {
			take: 3,
			cursor: null,
			status: null,
			search: null,
			dismissed: 'active',
			owner: null,
			assignee: null,
			// `now` is a fresh Date per call — match the shape, not the exact instant.
			attributes: expect.objectContaining({
				hasReplies: false,
				urgency: null,
				deadline: null,
				pendingFollowup: false,
				hasAppointment: false
			})
		});
	});

	it('returns null nextCursor when the page is not full', async () => {
		const only = makeOpportunityRecord(PrismaOpportunityStatus.NEW);
		const repository = makeRepository({
			listByOrganization: jest.fn().mockReturnValue(Promise.resolve([only]))
		});
		const service = makeService({ repository });

		const list = await service.list('org-1', {
			cursor: null,
			limit: 25,
			status: null,
			search: null,
			dismissed: null,
			owner: null,
			assignee: null,
			hasReplies: null,
			urgency: null,
			deadline: null,
			pendingFollowup: null,
			hasAppointment: null,
			requestingUserId: null
		});

		expect(list.opportunities).toHaveLength(1);
		expect(list.nextCursor).toBeNull();
	});

	it('populates assignedToName from batched user label lookup', async () => {
		const assigned: OpportunityRecord = {
			...makeOpportunityRecord(PrismaOpportunityStatus.NEW),
			assignedToUserId: 'user-1'
		};
		const repository = makeRepository({
			listByOrganization: jest.fn().mockReturnValue(Promise.resolve([assigned])),
			findUserDisplayLabels: jest
				.fn()
				.mockReturnValue(Promise.resolve(new Map([['user-1', 'Jan de Vries']])))
		});
		const service = makeService({ repository });

		const list = await service.list('org-1', {
			cursor: null,
			limit: 25,
			status: null,
			search: null,
			dismissed: null,
			owner: null,
			assignee: null,
			hasReplies: null,
			urgency: null,
			deadline: null,
			pendingFollowup: null,
			hasAppointment: null,
			requestingUserId: null
		});

		expect(list.opportunities[0]?.assignedToName).toBe('Jan de Vries');
		expect(repository.findUserDisplayLabels).toHaveBeenCalledWith(['user-1']);
	});

	it('sets assignedToName to null when assignee is not found in label map', async () => {
		const assigned: OpportunityRecord = {
			...makeOpportunityRecord(PrismaOpportunityStatus.NEW),
			assignedToUserId: 'user-deleted'
		};
		const repository = makeRepository({
			listByOrganization: jest.fn().mockReturnValue(Promise.resolve([assigned])),
			// Label map does not contain the assignee (e.g. user was deleted mid-flight).
			findUserDisplayLabels: jest.fn().mockReturnValue(Promise.resolve(new Map()))
		});
		const service = makeService({ repository });

		const list = await service.list('org-1', {
			cursor: null,
			limit: 25,
			status: null,
			search: null,
			dismissed: null,
			owner: null,
			assignee: null,
			hasReplies: null,
			urgency: null,
			deadline: null,
			pendingFollowup: null,
			hasAppointment: null,
			requestingUserId: null
		});

		expect(list.opportunities[0]?.assignedToName).toBeNull();
	});
});

describe('OpportunitiesService.updateStatus', () => {
	it('allows legal transitions and returns wire-format status', async () => {
		const current = makeOpportunityRecord(PrismaOpportunityStatus.NEW);
		const updated = makeOpportunityRecord(PrismaOpportunityStatus.COLD);
		const repository = makeRepository({
			findByIdForOrganization: jest.fn().mockReturnValue(Promise.resolve(current)),
			updateStatus: jest.fn().mockReturnValue(Promise.resolve(updated))
		});
		const service = makeService({ repository });

		const result = await service.updateStatus('org-1', 'opp-1', 'cold', 'user-1');

		expect(repository.updateStatus).toHaveBeenCalledWith('opp-1', PrismaOpportunityStatus.COLD);
		expect(result.status).toBe('cold');
		expect(result.customerDeadline).toBe('2026-06-01T00:00:00.000Z');
	});

	//  follow-up — the per-status transition policy was removed; any pair of statuses
	// is a legal transition. Previous "you can't pretend you didn't act" rules (WON/LOST
	// as dead ends; no return to NEW from a post-reply state) were aesthetic — solo SMB
	// owners need misclick recovery more than policy enforcement. The audit log remains
	// the source of truth for forensics. These two specs lock in the two previously-
	// blocked cases so a future reintroduction of the gate doesn't silently break them.
	it('permits any transition (previously restricted): WON → NEW', async () => {
		const current = makeOpportunityRecord(PrismaOpportunityStatus.WON);
		const updated = makeOpportunityRecord(PrismaOpportunityStatus.NEW);
		const repository = makeRepository({
			findByIdForOrganization: jest.fn().mockReturnValue(Promise.resolve(current)),
			updateStatus: jest.fn().mockReturnValue(Promise.resolve(updated))
		});
		const service = makeService({ repository });

		const result = await service.updateStatus('org-1', 'opp-1', 'new', 'user-1');

		expect(repository.updateStatus).toHaveBeenCalledWith('opp-1', PrismaOpportunityStatus.NEW);
		expect(result.status).toBe('new');
	});

	it('permits any transition (previously restricted): REPLIED → NEW', async () => {
		const current = makeOpportunityRecord(PrismaOpportunityStatus.REPLIED);
		const updated = makeOpportunityRecord(PrismaOpportunityStatus.NEW);
		const repository = makeRepository({
			findByIdForOrganization: jest.fn().mockReturnValue(Promise.resolve(current)),
			updateStatus: jest.fn().mockReturnValue(Promise.resolve(updated))
		});
		const service = makeService({ repository });

		const result = await service.updateStatus('org-1', 'opp-1', 'new', 'user-1');

		expect(repository.updateStatus).toHaveBeenCalledWith('opp-1', PrismaOpportunityStatus.NEW);
		expect(result.status).toBe('new');
	});

	it('returns 404 when the opportunity is not in the active organization', async () => {
		const service = makeService({ repository: makeRepository() });

		await expect(service.updateStatus('org-1', 'missing', 'cold', 'user-1')).rejects.toBeInstanceOf(
			NotFoundException
		);
	});
});

import { OpportunityStatus as PrismaOpportunityStatus } from '@/generated/prisma/enums';
import { OpportunitiesRepository } from '@/modules/opportunities/opportunities.repository';
import type { PrismaService } from '@/modules/prisma/prisma.service';
import { describe, expect, it, jest } from '@jest/globals';

function makePrisma(createCount: number): {
	prisma: PrismaService;
	opportunityCreateMany: jest.Mock;
	rawMessageUpdate: jest.Mock;
} {
	const opportunityCreateMany = jest.fn().mockReturnValue(Promise.resolve({ count: createCount }));
	const rawMessageUpdate = jest.fn().mockReturnValue(Promise.resolve({}));
	const tx = {
		opportunity: { createMany: opportunityCreateMany },
		rawMessage: { update: rawMessageUpdate }
	};
	const prisma = {
		$transaction: jest.fn().mockImplementation((fn: unknown) => (fn as (txArg: typeof tx) => Promise<unknown>)(tx))
	};

	return { prisma: prisma as unknown as PrismaService, opportunityCreateMany, rawMessageUpdate };
}

const CREATE_INPUT = {
	rawMessage: {
		id: 'raw-1',
		emailAccountId: 'email-account-1',
		organizationId: 'org-1',
		internalDate: new Date('2026-05-17T10:00:00.000Z'),
		subject: 'Offerte',
		fromEmail: 'alice@example.com',
		fromName: 'Alice',
		raw: {},
		provider: 'GMAIL' as const
	},
	classification: { isQuote: true, confidence: 0.92, reason: 'Offerte aanvraag' },
	extraction: {
		customerName: 'Alice',
		customerEmail: 'alice@example.com',
		address: 'Utrecht',
		requestType: 'CV-ketel vervangen',
		urgency: 'high' as const,
		customerDeadline: '2026-06-01',
		customerAppointment: null,
		deliverableHints: ['CV-ketel']
	},
	aiProvider: 'openai/gpt-4o',
	classifiedAiCallId: 'classifier-call-id',
	extractedAiCallId: 'extractor-call-id'
};

describe('OpportunitiesRepository.createOpportunityFromRawMessage', () => {
	it('creates the opportunity with rawMessageId as the idempotency key and marks the raw message classified', async () => {
		const { prisma, opportunityCreateMany, rawMessageUpdate } = makePrisma(1);
		const repository = new OpportunitiesRepository(prisma);

		const created = await repository.createOpportunityFromRawMessage(CREATE_INPUT);

		expect(created).toBe(true);
		expect(opportunityCreateMany).toHaveBeenCalledWith(
			expect.objectContaining({
				skipDuplicates: true,
				data: [
					expect.objectContaining({
						rawMessageId: 'raw-1',
						status: PrismaOpportunityStatus.NEW,
						customerDeadline: new Date('2026-06-01T00:00:00.000Z')
					})
				]
			})
		);
		expect(rawMessageUpdate).toHaveBeenCalledWith({
			where: { id: 'raw-1' },
			data: { isQuoteRequest: true, classifiedAt: expect.any(Date) as unknown as Date }
		});
	});

	it('returns false when the opportunity already exists and createMany skips the duplicate', async () => {
		const { prisma } = makePrisma(0);
		const repository = new OpportunitiesRepository(prisma);

		await expect(repository.createOpportunityFromRawMessage(CREATE_INPUT)).resolves.toBe(false);
	});
});

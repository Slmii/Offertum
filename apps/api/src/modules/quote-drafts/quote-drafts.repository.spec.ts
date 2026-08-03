import { QuoteDraftsRepository } from '@/modules/quote-drafts/quote-drafts.repository';
import type { PrismaService } from '@/modules/prisma/prisma.service';
import { describe, expect, it, jest } from '@jest/globals';

function makePrisma(maxPosition: number | null): {
	prisma: PrismaService;
	executeRaw: jest.Mock;
	aggregate: jest.Mock;
	create: jest.Mock;
} {
	const executeRaw = jest.fn().mockReturnValue(Promise.resolve(0));
	const aggregate = jest.fn().mockReturnValue(Promise.resolve({ _max: { position: maxPosition } }));
	const create = jest.fn().mockReturnValue(Promise.resolve({}));
	const tx = { $executeRaw: executeRaw, quoteLineItem: { aggregate, create } };
	const prisma = {
		$transaction: jest.fn().mockImplementation((fn: unknown) => (fn as (txArg: typeof tx) => Promise<unknown>)(tx))
	};

	return { prisma: prisma as unknown as PrismaService, executeRaw, aggregate, create };
}

const ADD_LINE_INPUT = {
	description: 'Extra werkzaamheden',
	unit: 'stuk',
	quantity: '1',
	unitPriceEur: '100.00',
	vatRate: 21,
	vatReverseCharged: false
};

describe('QuoteDraftsRepository.addLine', () => {
	it('locks the parent draft row before computing the next position', async () => {
		const { prisma, executeRaw, aggregate, create } = makePrisma(2);
		const repo = new QuoteDraftsRepository(prisma);

		await repo.addLine('draft-1', ADD_LINE_INPUT);

		// The lock must be taken (and thus the transaction must have entered) before the
		// position is read, so concurrent callers serialize on it rather than both observing
		// the same MAX(position).
		expect(executeRaw).toHaveBeenCalledTimes(1);
		expect(aggregate).toHaveBeenCalledWith({ where: { quoteDraftId: 'draft-1' }, _max: { position: true } });
		expect(create).toHaveBeenCalledWith({
			data: expect.objectContaining({ quoteDraftId: 'draft-1', position: 3, source: 'INFERRED', wasEditedByUser: true })
		});
	});

	it('starts at position 0 for the first line on a draft', async () => {
		const { prisma, create } = makePrisma(null);
		const repo = new QuoteDraftsRepository(prisma);

		await repo.addLine('draft-2', ADD_LINE_INPUT);

		expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ position: 0 }) });
	});
});

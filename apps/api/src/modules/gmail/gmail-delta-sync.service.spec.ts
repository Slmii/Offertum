import { EmailProvider } from '@/generated/prisma/enums';
import { EmailAccountsService } from '@/modules/email-accounts/email-accounts.service';
import { GmailApiService, GmailHistoryExpiredException } from '@/modules/gmail/gmail-api.service';
import { GmailDeltaSyncService } from '@/modules/gmail/gmail-delta-sync.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { describe, expect, it, jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';

// LogService stub — delta-sync emits action logs (orphaned, no_cursor, history_expired,
// completed) which these tests don't assert on by default.
const logServiceStub = { logAction: () => undefined } as unknown as ConstructorParameters<
	typeof GmailDeltaSyncService
>[3];

interface FakePrisma {
	emailAccount: {
		findUnique: jest.Mock;
		update: jest.Mock;
	};
	rawMessage: {
		findMany: jest.Mock;
		createMany: jest.Mock;
	};
}

function makePrisma(emailAccountRow: object | null, existingRawIds: string[] = []): FakePrisma {
	return {
		emailAccount: {
			findUnique: jest.fn().mockReturnValue(Promise.resolve(emailAccountRow)),
			update: jest.fn().mockReturnValue(Promise.resolve({}))
		},
		rawMessage: {
			findMany: jest.fn().mockReturnValue(Promise.resolve(existingRawIds.map(id => ({ providerMessageId: id })))),
			createMany: jest.fn().mockImplementation((args: unknown) => {
				const data = (args as { data: unknown[] }).data;
				return Promise.resolve({ count: data.length });
			})
		}
	};
}

function makeAccounts(): EmailAccountsService {
	const withFreshAccessToken = jest.fn().mockImplementation((..._args: unknown[]) => {
		const fn = _args[1] as (t: string) => Promise<unknown>;
		return fn('TOKEN');
	});
	return { withFreshAccessToken } as unknown as EmailAccountsService;
}

interface HistoryStub {
	addedIds: string[];
}

function makeApi(opts: {
	historyPages: ReadonlyArray<HistoryStub>;
	finalHistoryId?: string;
	historyExpiredOnFirstCall?: boolean;
	profileHistoryId?: string;
}): GmailApiService {
	const pageIterator = opts.historyPages.values();
	const listHistoryPage = jest.fn().mockImplementation(() => {
		if (opts.historyExpiredOnFirstCall) {
			throw new GmailHistoryExpiredException();
		}
		const next = pageIterator.next();
		if (next.done) {
			return Promise.resolve({
				history: [],
				nextPageToken: null,
				historyId: opts.finalHistoryId ?? 'history-99'
			});
		}
		const isLast = opts.historyPages.indexOf(next.value) === opts.historyPages.length - 1;
		return Promise.resolve({
			history: next.value.addedIds.map((id, i) => ({
				id: `h-${id}`,
				messagesAdded: [{ message: { id, threadId: `t-${id}-${i}` } }]
			})),
			nextPageToken: isLast ? null : `tok-${next.value.addedIds[0]}`,
			historyId: opts.finalHistoryId ?? 'history-99'
		});
	});

	const allIds = opts.historyPages.flatMap(p => p.addedIds);
	const getMessageFull = jest.fn().mockImplementation((_token: unknown, id: unknown) => {
		const known = allIds.includes(id as string);
		if (!known) {
			throw new Error(`stub message ${String(id)} not in test setup`);
		}
		return Promise.resolve({
			id,
			threadId: `t-${id}`,
			internalDate: String(Date.now()),
			snippet: '',
			payload: { headers: [{ name: 'Subject', value: `Subject for ${id}` }] }
		});
	});

	const getProfile = jest.fn().mockReturnValue(
		Promise.resolve({
			emailAddress: 'alice@quoteom.dev',
			messagesTotal: 1,
			threadsTotal: 1,
			historyId: opts.profileHistoryId ?? 'history-recovered'
		})
	);

	return {
		listHistoryPage,
		getMessageFull,
		getProfile
	} as unknown as GmailApiService;
}

const SCOPE_ROW = {
	id: 'ea-1',
	organizationId: 'org-1',
	userId: 'user-1',
	email: 'alice@quoteom.dev',
	provider: EmailProvider.GMAIL,
	historyId: 'history-start'
};

describe('GmailDeltaSyncService.run', () => {
	it('throws NotFoundException when EmailAccount is missing', async () => {
		const prisma = makePrisma(null);
		const service = new GmailDeltaSyncService(
			prisma as unknown as PrismaService,
			makeAccounts(),
			makeApi({ historyPages: [] }),
			logServiceStub
		);
		await expect(service.run('ea-missing')).rejects.toBeInstanceOf(NotFoundException);
	});

	it('skips when EmailAccount has no userId (orphaned)', async () => {
		const prisma = makePrisma({ ...SCOPE_ROW, userId: null });
		const service = new GmailDeltaSyncService(
			prisma as unknown as PrismaService,
			makeAccounts(),
			makeApi({ historyPages: [] }),
			logServiceStub
		);
		const result = await service.run('ea-1');
		expect(result.pagesFetched).toBe(0);
		expect(result.messagesInserted).toBe(0);
		expect(prisma.emailAccount.update).not.toHaveBeenCalled();
	});

	it('skips when EmailAccount has no historyId (backfill never completed)', async () => {
		const prisma = makePrisma({ ...SCOPE_ROW, historyId: null });
		const service = new GmailDeltaSyncService(
			prisma as unknown as PrismaService,
			makeAccounts(),
			makeApi({ historyPages: [] }),
			logServiceStub
		);
		const result = await service.run('ea-1');
		expect(result.pagesFetched).toBe(0);
		expect(prisma.emailAccount.update).not.toHaveBeenCalled();
	});

	it('persists new messages from a single history page and advances the cursor', async () => {
		const prisma = makePrisma(SCOPE_ROW, []);
		const service = new GmailDeltaSyncService(
			prisma as unknown as PrismaService,
			makeAccounts(),
			makeApi({
				historyPages: [{ addedIds: ['g-1', 'g-2'] }],
				finalHistoryId: 'history-100'
			}),
			logServiceStub
		);

		const result = await service.run('ea-1');

		expect(result).toMatchObject({
			pagesFetched: 1,
			messagesInserted: 2,
			messagesSkipped: 0,
			historyId: 'history-100',
			historyExpired: false
		});
		expect(prisma.emailAccount.update).toHaveBeenCalledWith({
			where: { id: 'ea-1' },
			data: { historyId: 'history-100' }
		});
	});

	it('deduplicates message IDs that appear in multiple history records', async () => {
		const prisma = makePrisma(SCOPE_ROW, []);
		// Same id `g-dup` referenced in two records — should only fetch + insert once.
		const service = new GmailDeltaSyncService(
			prisma as unknown as PrismaService,
			makeAccounts(),
			makeApi({
				historyPages: [{ addedIds: ['g-dup', 'g-dup', 'g-other'] }],
				finalHistoryId: 'history-100'
			}),
			logServiceStub
		);

		const result = await service.run('ea-1');

		expect(result.messagesInserted).toBe(2);
		const createCall = prisma.rawMessage.createMany.mock.calls[0]?.[0] as {
			data: Array<{ providerMessageId: string }>;
		};
		expect(createCall.data.map(d => d.providerMessageId).sort()).toEqual(['g-dup', 'g-other']);
	});

	it('skips messages already present (idempotency)', async () => {
		const prisma = makePrisma(SCOPE_ROW, ['g-1']);
		const service = new GmailDeltaSyncService(
			prisma as unknown as PrismaService,
			makeAccounts(),
			makeApi({
				historyPages: [{ addedIds: ['g-1', 'g-2'] }],
				finalHistoryId: 'history-100'
			}),
			logServiceStub
		);

		const result = await service.run('ea-1');

		expect(result.messagesInserted).toBe(1);
		expect(result.messagesSkipped).toBe(1);
		const createCall = prisma.rawMessage.createMany.mock.calls[0]?.[0] as {
			data: Array<{ providerMessageId: string }>;
		};
		expect(createCall.data.map(d => d.providerMessageId)).toEqual(['g-2']);
	});

	it('recovers from history-expired by re-acquiring the cursor via getProfile', async () => {
		const prisma = makePrisma(SCOPE_ROW, []);
		const service = new GmailDeltaSyncService(
			prisma as unknown as PrismaService,
			makeAccounts(),
			makeApi({
				historyPages: [],
				historyExpiredOnFirstCall: true,
				profileHistoryId: 'history-recovered-7'
			}),
			logServiceStub
		);

		const result = await service.run('ea-1');

		expect(result.historyExpired).toBe(true);
		expect(result.historyId).toBe('history-recovered-7');
		expect(result.messagesInserted).toBe(0);
		expect(prisma.emailAccount.update).toHaveBeenCalledWith({
			where: { id: 'ea-1' },
			data: { historyId: 'history-recovered-7' }
		});
	});

	it('does not call createMany on an empty delta (zero messagesAdded)', async () => {
		const prisma = makePrisma(SCOPE_ROW, []);
		const service = new GmailDeltaSyncService(
			prisma as unknown as PrismaService,
			makeAccounts(),
			makeApi({
				historyPages: [{ addedIds: [] }],
				finalHistoryId: 'history-100'
			}),
			logServiceStub
		);

		const result = await service.run('ea-1');

		expect(result.messagesInserted).toBe(0);
		expect(prisma.rawMessage.createMany).not.toHaveBeenCalled();
		// Cursor still advances even on a no-op delta.
		expect(prisma.emailAccount.update).toHaveBeenCalledWith({
			where: { id: 'ea-1' },
			data: { historyId: 'history-100' }
		});
	});
});

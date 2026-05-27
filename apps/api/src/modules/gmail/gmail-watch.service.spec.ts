import { daysToMs } from '@/lib/time/duration';
import type { EnvSchema } from '@/config/env.schema';
import { EmailProvider } from '@/generated/prisma/enums';
import type { EmailAccountsService } from '@/modules/email-accounts/email-accounts.service';
import type { GmailApiService } from '@/modules/gmail/gmail-api.service';
import { GmailWatchService } from '@/modules/gmail/gmail-watch.service';
import type { LogService } from '@/modules/logger/log.service';
import type { PrismaService } from '@/modules/prisma/prisma.service';
import { describe, expect, it, jest } from '@jest/globals';
import type { ConfigService } from '@nestjs/config';

interface FakePrisma {
	emailAccount: {
		findMany: jest.Mock;
		findUnique: jest.Mock;
		update: jest.Mock;
	};
}

function makePrisma(
	rows: ReadonlyArray<{ id: string; watchExpiresAt?: Date | null; historyId?: string | null }>
): FakePrisma {
	return {
		emailAccount: {
			// findMany respects the OR clause we care about: rows where watchExpiresAt < cutoff
			// OR (watchExpiresAt is null AND historyId is not null). We're not actually exercising
			// the Prisma filter — we just stub findMany to return whatever the test asks for.
			findMany: jest.fn().mockReturnValue(Promise.resolve(rows.map(r => ({ id: r.id })))),
			findUnique: jest.fn().mockImplementation((args: unknown) => {
				const id = (args as { where: { id: string } }).where.id;
				const row = rows.find(r => r.id === id);
				if (!row) {
					return Promise.resolve(null);
				}
				return Promise.resolve({
					id: row.id,
					organizationId: 'org-1',
					userId: 'user-1',
					email: `${row.id}@offertum.dev`,
					provider: EmailProvider.GMAIL
				});
			}),
			update: jest.fn().mockReturnValue(Promise.resolve({}))
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

function makeApi(opts: { startWatch?: jest.Mock } = {}): GmailApiService {
	return {
		startWatch:
			opts.startWatch ??
			jest.fn().mockReturnValue(
				Promise.resolve({
					historyId: '999',
					// 7 days from "now"
					expiration: String(Date.now() + daysToMs(7))
				})
			),
		stopWatch: jest.fn().mockReturnValue(Promise.resolve())
	} as unknown as GmailApiService;
}

function makeConfig(topic: string | undefined): ConfigService<EnvSchema, true> {
	return { get: jest.fn().mockReturnValue(topic) } as unknown as ConfigService<EnvSchema, true>;
}

const logServiceStub = { logAction: jest.fn() } as unknown as LogService;

describe('GmailWatchService.renewExpiringWatches', () => {
	it('no-ops with structured log when GOOGLE_PUBSUB_TOPIC is not configured', async () => {
		const prisma = makePrisma([]);
		const service = new GmailWatchService(
			prisma as unknown as PrismaService,
			makeAccounts(),
			makeApi(),
			makeConfig(undefined),
			logServiceStub
		);

		const result = await service.renewExpiringWatches();

		expect(result).toEqual({ scanned: 0, renewed: 0, skipped: 0, failed: 0 });
		// Did not even attempt to scan the DB.
		expect(prisma.emailAccount.findMany).not.toHaveBeenCalled();
	});

	it('queries with OR clause that picks up both expiring AND orphaned rows', async () => {
		const prisma = makePrisma([]);
		const service = new GmailWatchService(
			prisma as unknown as PrismaService,
			makeAccounts(),
			makeApi(),
			makeConfig('projects/x/topics/y'),
			logServiceStub
		);

		await service.renewExpiringWatches();

		// Verify the Prisma filter shape — load-bearing for fix #2.
		const findManyCall = prisma.emailAccount.findMany.mock.calls[0]?.[0] as {
			where: {
				provider: string;
				OR: Array<Record<string, unknown>>;
			};
		};
		expect(findManyCall.where.provider).toBe(EmailProvider.GMAIL);
		expect(findManyCall.where.OR).toEqual([
			{ watchExpiresAt: { lt: expect.any(Date) } },
			{ watchExpiresAt: null, historyId: { not: null } }
		]);
	});

	it('renews each candidate via api.startWatch + updates watchExpiresAt', async () => {
		const prisma = makePrisma([
			{ id: 'ea-expiring', watchExpiresAt: new Date(Date.now() + 3600_000) },
			{ id: 'ea-orphan', watchExpiresAt: null, historyId: 'h-1' }
		]);
		const startWatch = jest
			.fn()
			.mockReturnValue(Promise.resolve({ historyId: 'h-99', expiration: String(Date.now() + daysToMs(7)) }));
		const service = new GmailWatchService(
			prisma as unknown as PrismaService,
			makeAccounts(),
			makeApi({ startWatch }),
			makeConfig('projects/x/topics/y'),
			logServiceStub
		);

		const result = await service.renewExpiringWatches();

		expect(result).toMatchObject({ scanned: 2, renewed: 2, failed: 0 });
		expect(startWatch).toHaveBeenCalledTimes(2);
		expect(prisma.emailAccount.update).toHaveBeenCalledTimes(2);
	});

	it('continues with remaining candidates when one renewal throws', async () => {
		const prisma = makePrisma([
			{ id: 'ea-good', watchExpiresAt: new Date(Date.now() + 3600_000) },
			{ id: 'ea-bad', watchExpiresAt: new Date(Date.now() + 3600_000) }
		]);
		let callIndex = 0;
		const startWatch = jest.fn().mockImplementation(() => {
			const idx = callIndex++;
			if (idx === 0) {
				throw new Error('Gmail API 500');
			}
			return Promise.resolve({
				historyId: 'h-99',
				expiration: String(Date.now() + daysToMs(7))
			});
		});

		const service = new GmailWatchService(
			prisma as unknown as PrismaService,
			makeAccounts(),
			makeApi({ startWatch }),
			makeConfig('projects/x/topics/y'),
			logServiceStub
		);

		const result = await service.renewExpiringWatches();

		expect(result).toMatchObject({ scanned: 2, renewed: 1, failed: 1 });
		expect(startWatch).toHaveBeenCalledTimes(2);
	});
});

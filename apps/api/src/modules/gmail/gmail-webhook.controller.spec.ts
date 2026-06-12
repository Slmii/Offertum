import type { EnvSchema } from '@/config/env.schema';
import { EmailProvider } from '@/generated/prisma/enums';
import { inngest } from '@/modules/inngest/inngest.client';
import type { LogService } from '@/modules/logger/log.service';
import { GmailWebhookController } from '@/modules/gmail/gmail-webhook.controller';
import type { PrismaService } from '@/modules/prisma/prisma.service';
import type { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request } from 'express';

function makeConfig(): ConfigService<EnvSchema, true> {
	return {
		get: jest.fn((key: string) => {
			if (key === 'GOOGLE_PUBSUB_AUDIENCE') {
				return 'https://example.test/api/email/gmail/webhook';
			}
			if (key === 'GOOGLE_PUBSUB_SERVICE_ACCOUNT') {
				return 'pubsub@example.iam.gserviceaccount.com';
			}
			return undefined;
		})
	} as unknown as ConfigService<EnvSchema, true>;
}

function makeRequest(payload: unknown): Request {
	const data = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
	return {
		body: {
			message: {
				data,
				messageId: 'msg-1',
				publishTime: '2026-05-28T10:00:00.000Z'
			},
			subscription: 'projects/demo/subscriptions/offertum'
		}
	} as unknown as Request;
}

describe('GmailWebhookController.receive', () => {
	beforeEach(() => {
		jest.restoreAllMocks();
		jest.spyOn(inngest, 'send').mockResolvedValue({ ids: [] } as never);
	});

	it('matches Gmail push email addresses case-insensitively', async () => {
		const findMany = jest.fn().mockResolvedValue([
			{
				id: 'email-account-1',
				organizationId: 'org-1',
				userId: 'user-1'
			}
		] as never);
		const prisma = {
			emailAccount: { findMany }
		} as unknown as PrismaService;
		const controller = new GmailWebhookController(makeConfig(), prisma, {
			logAction: jest.fn()
		} as unknown as LogService);
		// Stub JWT verification (instance-method seam — see GmailWebhookController.verifyToken).
		jest.spyOn(controller as unknown as { verifyToken: () => Promise<void> }, 'verifyToken').mockResolvedValue(
			undefined
		);

		await controller.receive(
			makeRequest({ emailAddress: 'Owner@Example.COM', historyId: '123' }),
			'Bearer signed-token'
		);

		expect(findMany).toHaveBeenCalledWith({
			where: {
				provider: EmailProvider.GMAIL,
				email: { equals: 'Owner@Example.COM', mode: 'insensitive' },
				disconnectedAt: null
			},
			select: { id: true, organizationId: true, userId: true }
		});
		expect(inngest.send).toHaveBeenCalledWith({
			name: 'gmail/history.changed',
			data: { emailAccountId: 'email-account-1', organizationId: 'org-1' }
		});
	});
});

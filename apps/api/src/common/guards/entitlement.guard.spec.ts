import { EntitlementGuard } from '@/common/guards/entitlement.guard';
import { MISSING_ORG_CONTEXT, SUBSCRIPTION_REQUIRED } from '@/lib/errors';
import { BILLING_REQUIRED_CODE } from '@/modules/billing/billing.constants';
import type { PrismaService } from '@/modules/prisma/prisma.service';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { type ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';

function makeContext(method: string, organizationId?: string): ExecutionContext {
	const request = { method, organizationId };
	return {
		switchToHttp: () => ({
			getRequest: () => request,
			getResponse: () => ({}),
			getNext: () => ({})
		})
	} as unknown as ExecutionContext;
}

interface FakePrisma {
	subscription: { findUnique: jest.Mock };
}

function makePrisma(sub: { status: string | null } | null): FakePrisma {
	return {
		subscription: {
			findUnique: jest.fn().mockReturnValue(Promise.resolve(sub))
		}
	};
}

describe('EntitlementGuard', () => {
	let guard: EntitlementGuard;

	beforeEach(() => {
		// Default Prisma — overridden per test where needed.
		guard = new EntitlementGuard(makePrisma(null) as unknown as PrismaService);
	});

	describe('read methods bypass the gate', () => {
		it.each(['GET', 'HEAD', 'OPTIONS'])('%s passes without touching Prisma', async method => {
			const prisma = makePrisma(null);
			const g = new EntitlementGuard(prisma as unknown as PrismaService);
			const result = await g.canActivate(makeContext(method, 'org-1'));
			expect(result).toBe(true);
			expect(prisma.subscription.findUnique).not.toHaveBeenCalled();
		});
	});

	describe('writes require entitlement', () => {
		it('throws 402 with the standard envelope when organizationId is missing', async () => {
			expect.assertions(5);
			try {
				await guard.canActivate(makeContext('POST'));
			} catch (error) {
				expect(error).toBeInstanceOf(HttpException);
				const response = (error as HttpException).getResponse() as Record<string, unknown>;
				expect(response.statusCode).toBe(HttpStatus.PAYMENT_REQUIRED);
				expect(response.code).toBe(BILLING_REQUIRED_CODE);
				expect(response.message).toBe(MISSING_ORG_CONTEXT);
				expect(response.billingPath).toBe('/billing');
			}
		});

		it.each(['trialing', 'active', 'past_due'])('allows writes when status is %s', async status => {
			const prisma = makePrisma({ status });
			const g = new EntitlementGuard(prisma as unknown as PrismaService);
			expect(await g.canActivate(makeContext('POST', 'org-1'))).toBe(true);
		});

		it('blocks writes when there is no Subscription row (state none)', async () => {
			const prisma = makePrisma(null);
			const g = new EntitlementGuard(prisma as unknown as PrismaService);

			expect.assertions(3);
			try {
				await g.canActivate(makeContext('POST', 'org-1'));
			} catch (error) {
				expect(error).toBeInstanceOf(HttpException);
				const response = (error as HttpException).getResponse() as Record<string, unknown>;
				expect(response.code).toBe(BILLING_REQUIRED_CODE);
				expect(response.message).toBe(SUBSCRIPTION_REQUIRED);
			}
		});

		it.each(['canceled', 'unpaid', 'paused', 'incomplete', 'incomplete_expired'])(
			'blocks writes when status is %s',
			async status => {
				const prisma = makePrisma({ status });
				const g = new EntitlementGuard(prisma as unknown as PrismaService);

				expect.assertions(2);
				try {
					await g.canActivate(makeContext('POST', 'org-1'));
				} catch (error) {
					expect(error).toBeInstanceOf(HttpException);
					expect((error as HttpException).getStatus()).toBe(HttpStatus.PAYMENT_REQUIRED);
				}
			}
		);

		it.each(['POST', 'PATCH', 'PUT', 'DELETE'])('write method %s is gated', async method => {
			const prisma = makePrisma(null);
			const g = new EntitlementGuard(prisma as unknown as PrismaService);
			await expect(g.canActivate(makeContext(method, 'org-1'))).rejects.toBeInstanceOf(HttpException);
		});
	});
});

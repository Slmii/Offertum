import { hoursToMs } from '@/lib/time/duration';
import { EmailProvider } from '@/generated/prisma/enums';
import { encrypt } from '@/lib/crypto/token-encryption';
import { OAuthRefreshTokenInvalidException } from '@/lib/oauth/oauth-errors';
import { EmailAccountsService, type MailboxScope } from '@/modules/email-accounts/email-accounts.service';
import type { GoogleOAuthService } from '@/modules/email-accounts/google-oauth.service';
import type { MicrosoftOAuthService } from '@/modules/email-accounts/microsoft-oauth.service';
import type { PrismaService } from '@/modules/prisma/prisma.service';
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';

/**
 * Builds a fake EmailAccountsService wired with stub Prisma + OAuth dependencies, with the
 * provider-specific refresh function attached to whichever OAuth service matches `provider`.
 *
 * The fake Prisma:
 *  - `findFirst` always returns the same stale row (`accessTokenExpiresAt` 1h in the past),
 *    so every call enters the refresh branch.
 *  - `updateMany` is silent on zero rows (mirrors real Prisma behavior — that's why we use
 *    `updateMany` with the `disconnectedAt: null` filter for self-heal: parallel callers
 *    racing to soft-disconnect resolve idempotently without P2025).
 *
 * The fake OAuth service:
 *  - `refreshAccessToken` always throws `OAuthRefreshTokenInvalidException`. This is the
 *    "user revoked our app upstream" signal that triggers the self-heal path.
 */
function makeService(provider: EmailProvider): {
	service: EmailAccountsService;
	updateManyCalls: jest.Mock;
	refreshCalls: jest.Mock;
	logActionCalls: jest.Mock;
} {
	const row = {
		id: 'ea-1',
		email: 'alice@quoteom.dev',
		provider,
		organizationId: 'org-1',
		userId: 'user-1',
		accessToken: encrypt('cached-access-token'),
		refreshToken: encrypt('dead-refresh-token'),
		accessTokenExpiresAt: new Date(Date.now() - hoursToMs(1)),
		scope: 'Mail.Read'
	};

	const updateManyCalls = jest.fn().mockReturnValue(Promise.resolve({ count: 1 }));
	const refreshCalls = jest.fn().mockImplementation(() => {
		throw new OAuthRefreshTokenInvalidException();
	});

	const prisma = {
		emailAccount: {
			findFirst: jest.fn().mockReturnValue(Promise.resolve(row)),
			updateMany: updateManyCalls
		}
	} as unknown as PrismaService;

	// Attach the fake refresh only to the OAuth service for the provider under test —
	// the other one must never be invoked. If `oauthFor()` dispatched wrong, the test
	// would fail loudly with "refreshAccessToken is not a function" on the empty stub.
	const google = (provider === EmailProvider.GMAIL
		? { refreshAccessToken: refreshCalls }
		: {}) as unknown as GoogleOAuthService;
	const microsoft = (provider === EmailProvider.MICROSOFT
		? { refreshAccessToken: refreshCalls }
		: {}) as unknown as MicrosoftOAuthService;

	// LogService captures `logAction` calls so tests can assert on the self-heal action log.
	const logActionCalls = jest.fn();
	const logService = { logAction: logActionCalls } as unknown as ConstructorParameters<
		typeof EmailAccountsService
	>[3];

	return {
		service: new EmailAccountsService(prisma, google, microsoft, logService),
		updateManyCalls,
		refreshCalls,
		logActionCalls
	};
}

describe('EmailAccountsService — parallel self-heal race', () => {
	const ORIGINAL_KEY = process.env.TOKEN_ENCRYPTION_KEY;

	beforeAll(() => {
		// Deterministic key — matches the pattern in token-encryption.spec.ts.
		process.env.TOKEN_ENCRYPTION_KEY = 'ab'.repeat(32);
	});

	afterAll(() => {
		process.env.TOKEN_ENCRYPTION_KEY = ORIGINAL_KEY;
	});

	/**
	 * Regression test for the production bug: `/settings/email` fires both `<provider>Status`
	 * and `<provider>Messages` in parallel from its route loader. When the access token is
	 * stale and the refresh token is dead (e.g. user revoked our app at the provider), BOTH
	 * queries independently:
	 *   1. detect the stale token,
	 *   2. attempt refresh,
	 *   3. get `invalid_grant`,
	 *   4. try to soft-disconnect the same EmailAccount row.
	 *
	 * The first soft-disconnect sets `disconnectedAt`; the second `updateMany` matches zero
	 * rows (filtered by `disconnectedAt: null`) and silently no-ops. Both callers then
	 * throw `NotFoundException` to the caller. The earlier hard-delete bug (Prisma P2025
	 * surfacing as a 500) was fixed by switching to `updateMany`; this spec pins the
	 * idempotent behavior across both providers.
	 */
	describe.each([EmailProvider.GMAIL, EmailProvider.MICROSOFT])('provider=%s', provider => {
		const scope: MailboxScope = { provider, organizationId: 'org-1', userId: 'user-1' };

		it('both parallel callers throw NotFoundException, neither throws Prisma P2025', async () => {
			const { service } = makeService(provider);

			const [a, b] = await Promise.allSettled([service.getAccessToken(scope), service.getAccessToken(scope)]);

			expect(a.status).toBe('rejected');
			expect(b.status).toBe('rejected');
			if (a.status === 'rejected') {
				expect(a.reason).toBeInstanceOf(NotFoundException);
			}
			if (b.status === 'rejected') {
				expect(b.reason).toBeInstanceOf(NotFoundException);
			}
		});

		it('both parallel callers reach the updateMany path — no silent short-circuit', async () => {
			const { service, updateManyCalls, refreshCalls } = makeService(provider);

			await Promise.allSettled([service.getAccessToken(scope), service.getAccessToken(scope)]);

			// Each caller independently hit the refresh + soft-disconnect branch.
			// Belt-and-suspenders against a future "optimization" that tries to dedupe
			// in-flight refreshes — the race only collides at the DB layer, which
			// `updateMany` with the `disconnectedAt: null` filter resolves idempotently
			// (the second call matches zero rows + no-ops).
			expect(refreshCalls).toHaveBeenCalledTimes(2);
			expect(updateManyCalls).toHaveBeenCalledTimes(2);
			expect(updateManyCalls).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { id: 'ea-1', disconnectedAt: null },
					data: expect.objectContaining({
						disconnectedAt: expect.any(Date) as unknown as Date,
						deltaLink: null,
						historyId: null,
						subscriptionId: null,
						subscriptionClientState: null,
						watchExpiresAt: null
					})
				})
			);
		});

		it('emits email.disconnect.self_heal at warn level when the row is soft-disconnected', async () => {
			const { service, logActionCalls } = makeService(provider);

			await Promise.allSettled([service.getAccessToken(scope)]);

			expect(logActionCalls).toHaveBeenCalledWith(
				expect.objectContaining({
					action: 'email.disconnect.self_heal',
					level: 'warn',
					metadata: expect.objectContaining({
						provider,
						emailAccountId: 'ea-1',
						email: 'alice@quoteom.dev',
						trigger: 'invalid_grant'
					})
				})
			);
		});
	});
});

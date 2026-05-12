import { EmailProvider } from '@/generated/prisma/enums';
import { decrypt, encrypt } from '@/lib/crypto/token-encryption';
import { EMAIL_ACCOUNT_NOT_FOUND } from '@/lib/errors';
import { GoogleOAuthService, type TokenSet } from '@/modules/gmail/google-oauth.service';
import { GmailUnauthorizedException, OAuthRefreshTokenInvalidException } from '@/modules/gmail/oauth-errors';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';

/**
 * Refresh tokens that are within this window of expiring are refreshed proactively
 * BEFORE a call. Tighter than the access token's full TTL (Google: 1 h) so we don't
 * fail an API call mid-flight when the token expires while the request is in flight.
 */
const REFRESH_HEAD_START_MS = 60_000;

interface UpsertInput {
	organizationId: string;
	userId: string;
	providerAccountId: string;
	email: string;
	tokens: TokenSet;
}

interface PerUserScope {
	organizationId: string;
	userId: string;
}

/**
 * Owns the EmailAccount Prisma row + the encrypt-on-write / decrypt-on-read invariant.
 * Every method is keyed on (organizationId, userId) — each user manages their own mailbox
 * connection inside an org, and members can't see/disconnect each other's mailboxes.
 *
 * Anything that needs an access token for a connected mailbox goes through
 * `getAccessToken`, which transparently refreshes on demand.
 */
@Injectable()
export class EmailAccountsService {
	private readonly logger = new Logger(EmailAccountsService.name);

	constructor(
		private readonly prisma: PrismaService,
		private readonly oauth: GoogleOAuthService
	) {}

	/**
	 * Persist a freshly-completed OAuth handshake for one user's mailbox. Upserts on
	 * `(organizationId, provider, providerAccountId)` so reconnecting the same Gmail
	 * account inside the same org replaces the old tokens rather than duplicating the row.
	 *
	 * If the second consent didn't produce a fresh refresh_token (rare — `prompt=consent`
	 * should always trigger one), we keep the old one rather than crashing.
	 */
	async upsertGmail(input: UpsertInput): Promise<{ id: string }> {
		const existing = await this.prisma.emailAccount.findUnique({
			where: {
				organizationId_provider_providerAccountId: {
					organizationId: input.organizationId,
					provider: EmailProvider.GMAIL,
					providerAccountId: input.providerAccountId
				}
			}
		});

		// Refresh token: prefer the fresh one Google issued; fall back to the existing
		// encrypted value if (rare) this exchange didn't include one. Either way the
		// stored value is always encrypted ciphertext.
		const refreshTokenCipher = input.tokens.refreshToken
			? encrypt(input.tokens.refreshToken)
			: (existing?.refreshToken ?? null);

		if (!refreshTokenCipher) {
			throw new Error('No refresh token in token exchange response and no existing one on file');
		}

		const data = {
			email: input.email,
			scope: input.tokens.scope,
			accessToken: encrypt(input.tokens.accessToken),
			refreshToken: refreshTokenCipher,
			accessTokenExpiresAt: input.tokens.expiresAt,
			// Always rewrite the userId on upsert — if a second user happens to authorize
			// the same Google account on the same org (edge case), the row reflects who
			// connected it most recently.
			userId: input.userId
		};

		const row = await this.prisma.emailAccount.upsert({
			where: {
				organizationId_provider_providerAccountId: {
					organizationId: input.organizationId,
					provider: EmailProvider.GMAIL,
					providerAccountId: input.providerAccountId
				}
			},
			create: {
				organizationId: input.organizationId,
				provider: EmailProvider.GMAIL,
				providerAccountId: input.providerAccountId,
				...data
			},
			update: data,
			select: { id: true }
		});

		this.logger.log(`Gmail ${input.email} connected to org ${input.organizationId} by user ${input.userId}`);
		return row;
	}

	/**
	 * Return THIS user's Gmail account in the given org, or null.
	 *
	 * **Side effect:** if the stored access token has already expired (we'd need to
	 * refresh anyway on the next API call), proactively attempt a refresh. If Google
	 * rejects with `invalid_grant` we delete the row and return null — so the status
	 * endpoint correctly reports "not connected" instead of staying stuck on stale state
	 * after a user revokes our app from myaccount.google.com.
	 *
	 * We deliberately do NOT verify on every status read: a fresh access token already
	 * proves Google was happy ~1 h ago, and the refresh-attempt path is the same code
	 * the next "real" call would take anyway. Costs at most one POST to /token per page
	 * load when the token is past expiry — no extra quota when everything is healthy.
	 */
	async findGmailAccount(scope: PerUserScope) {
		const row = await this.prisma.emailAccount.findFirst({
			where: {
				organizationId: scope.organizationId,
				userId: scope.userId,
				provider: EmailProvider.GMAIL
			}
		});
		if (!row) {
			return null;
		}

		const expiresAt = row.accessTokenExpiresAt;
		const isFresh = expiresAt && expiresAt.getTime() - Date.now() > REFRESH_HEAD_START_MS;

		if (!isFresh) {
			// Attempt refresh — same path as getAccessToken's. If invalid_grant, delete
			// the row and return null. Other errors bubble up — failing the status read
			// loudly is preferable to silently masking a transient outage as "disconnected."
			try {
				await this.getAccessToken(scope);
			} catch (error) {
				if (error instanceof NotFoundException) {
					// getAccessToken already deleted the row + threw — translate to null.
					return null;
				}
				throw error;
			}
		}

		return this.prisma.emailAccount.findFirst({
			where: {
				organizationId: scope.organizationId,
				userId: scope.userId,
				provider: EmailProvider.GMAIL
			},
			select: {
				id: true,
				email: true,
				scope: true,
				createdAt: true,
				accessTokenExpiresAt: true
			}
		});
	}

	/**
	 * Return a usable access token for THIS user's Gmail account. Refreshes via Google's
	 * `/token` endpoint if the stored token is past (or near) expiry. Writes the new
	 * access token back to the row in the same call.
	 *
	 * Pass `{ forceRefresh: true }` to bypass the freshness check — required when the
	 * cached token already failed at Google (e.g. a Gmail API call returned 401 because
	 * the user revoked our app upstream). Without forcing, we'd happily return the same
	 * dead token from cache and loop forever.
	 *
	 * **Self-healing on revoke:** if Google rejects the refresh with `invalid_grant`
	 * (user revoked our app at myaccount.google.com, idle timeout, etc.) we delete the
	 * stale row and surface a `NotFoundException`. From the caller's perspective the
	 * mailbox is now disconnected — the UI flips to the "Connect Gmail" CTA on the next
	 * status fetch instead of lying about a connection we can't actually use.
	 *
	 * Cascade clears `RawMessage` rows tied to the same EmailAccount — same shape as
	 * the explicit `disconnectGmail` path.
	 */
	async getAccessToken(scope: PerUserScope, opts: { forceRefresh?: boolean } = {}): Promise<string> {
		const row = await this.prisma.emailAccount.findFirst({
			where: {
				organizationId: scope.organizationId,
				userId: scope.userId,
				provider: EmailProvider.GMAIL
			}
		});

		if (!row) {
			throw new NotFoundException(EMAIL_ACCOUNT_NOT_FOUND);
		}

		const expiresAt = row.accessTokenExpiresAt;
		const isFresh = expiresAt && expiresAt.getTime() - Date.now() > REFRESH_HEAD_START_MS;
		if (isFresh && !opts.forceRefresh) {
			return decrypt(row.accessToken);
		}

		// Need a refresh. Decrypt the refresh token, hit Google, persist new access token.
		const refreshToken = decrypt(row.refreshToken);

		let refreshed: TokenSet;
		try {
			refreshed = await this.oauth.refreshAccessToken(refreshToken);
		} catch (error) {
			if (error instanceof OAuthRefreshTokenInvalidException) {
				this.logger.warn(
					`Gmail ${row.email} refresh token rejected by Google — deleting row for org ${scope.organizationId} / user ${scope.userId}`
				);
				await this.prisma.emailAccount.delete({ where: { id: row.id } });
				throw new NotFoundException(EMAIL_ACCOUNT_NOT_FOUND);
			}
			throw error;
		}

		await this.prisma.emailAccount.update({
			where: { id: row.id },
			data: {
				accessToken: encrypt(refreshed.accessToken),
				accessTokenExpiresAt: refreshed.expiresAt,
				scope: refreshed.scope
			}
		});

		return refreshed.accessToken;
	}

	/**
	 * Run a callback with a working access token, transparently retrying once if Google
	 * rejects the cached token with HTTP 401. Use this from any code that actually calls
	 * the Gmail API — it papers over the "cached token looks fresh on our side but was
	 * revoked upstream" gap that the time-based `getAccessToken` check can't catch.
	 *
	 * Flow:
	 *   1. Get a token via `getAccessToken` (cached unless expired).
	 *   2. Run `fn(token)`. If it succeeds → done.
	 *   3. If `fn` throws `GmailUnauthorizedException`, force a refresh and retry once.
	 *      - If the forced refresh succeeds → retry the call with the new token.
	 *      - If the forced refresh fails with `invalid_grant`, `getAccessToken` deletes
	 *        the row and throws `NotFoundException` — let that propagate (the UI layer
	 *        maps 404 to "not connected").
	 *   4. We only retry once. A second 401 indicates a deeper auth problem (clock skew,
	 *      malformed token, etc.) — bubble it up rather than loop forever.
	 */
	async withFreshAccessToken<T>(scope: PerUserScope, fn: (accessToken: string) => Promise<T>): Promise<T> {
		const token = await this.getAccessToken(scope);
		try {
			return await fn(token);
		} catch (error) {
			if (!(error instanceof GmailUnauthorizedException)) {
				throw error;
			}

			this.logger.warn(
				`Gmail returned 401 for org ${scope.organizationId} / user ${scope.userId} — forcing refresh + retry`
			);
			const refreshed = await this.getAccessToken(scope, { forceRefresh: true });
			return await fn(refreshed);
		}
	}

	/**
	 * Disconnect THIS user's Gmail in this org. Revokes at Google (best-effort — see
	 * GoogleOAuthService) then deletes the local row. Cascade clears any `RawMessage`
	 * rows tied to this connection.
	 *
	 * Idempotent — returns silently if there's no connected account for this user.
	 */
	async disconnectGmail(scope: PerUserScope): Promise<void> {
		const row = await this.prisma.emailAccount.findFirst({
			where: {
				organizationId: scope.organizationId,
				userId: scope.userId,
				provider: EmailProvider.GMAIL
			}
		});
		if (!row) {
			return;
		}

		const refreshToken = decrypt(row.refreshToken);
		await this.oauth.revoke(refreshToken);

		await this.prisma.emailAccount.delete({ where: { id: row.id } });
		this.logger.log(`Gmail ${row.email} disconnected from org ${scope.organizationId} by user ${scope.userId}`);
	}
}

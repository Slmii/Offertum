import { EmailProvider } from '@/generated/prisma/enums';
import { decrypt, encrypt } from '@/lib/crypto/token-encryption';
import { EMAIL_ACCOUNT_NOT_FOUND, NO_REFRESH_TOKEN_AVAILABLE } from '@/lib/errors';
import { MailboxUnauthorizedException, OAuthRefreshTokenInvalidException } from '@/lib/oauth/oauth-errors';
import { GoogleOAuthService, type TokenSet as GoogleTokenSet } from '@/modules/email-accounts/google-oauth.service';
import {
	MicrosoftOAuthService,
	type TokenSet as MicrosoftTokenSet
} from '@/modules/email-accounts/microsoft-oauth.service';
import { inngest } from '@/modules/inngest/inngest.client';
import { InngestEvents } from '@/modules/inngest/inngest.constants';
import { LogService } from '@/modules/logger/log.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';

/**
 * Refresh tokens that are within this window of expiring are refreshed proactively
 * BEFORE a call. Tighter than the access token's full TTL so we don't fail an API call
 * mid-flight when the token expires while the request is in flight.
 */
const REFRESH_HEAD_START_MS = 60_000;

/** Common shape from any provider's OAuth service. */
type ProviderTokenSet = GoogleTokenSet | MicrosoftTokenSet;

interface UpsertInput {
	provider: EmailProvider;
	organizationId: string;
	userId: string;
	providerAccountId: string;
	email: string;
	tokens: ProviderTokenSet;
}

/** Identifies which connected mailbox a caller is talking about. */
export interface MailboxScope {
	provider: EmailProvider;
	organizationId: string;
	userId: string;
}

/**
 * Owns the EmailAccount Prisma row + the encrypt-on-write / decrypt-on-read invariant
 * for every mail provider (Gmail today, Microsoft Graph in W3.2). Every method is keyed
 * on `(provider, organizationId, userId)` — each user manages their own mailbox per
 * provider inside an org; members can't see/disconnect each other's mailboxes.
 *
 * Provider-specific behavior (refresh, revoke, refresh-token rotation) is dispatched to
 * the appropriate OAuth service via the private `oauthFor()` resolver. The Prisma layer
 * and the encryption layer are 100% provider-agnostic.
 */
@Injectable()
export class EmailAccountsService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly google: GoogleOAuthService,
		private readonly microsoft: MicrosoftOAuthService,
		private readonly logService: LogService
	) {}

	private oauthFor(provider: EmailProvider): GoogleOAuthService | MicrosoftOAuthService {
		switch (provider) {
			case EmailProvider.GMAIL:
				return this.google;
			case EmailProvider.MICROSOFT:
				return this.microsoft;
		}
	}

	/**
	 * Emit the matching `<provider>/account.connected` event. Fire-and-forget — failed
	 * enqueue is logged but does not fail the connect handshake.
	 */
	private async emitConnectedEvent(
		provider: EmailProvider,
		emailAccountId: string,
		organizationId: string
	): Promise<void> {
		const name =
			provider === EmailProvider.GMAIL
				? InngestEvents.GmailAccountConnected
				: InngestEvents.MicrosoftAccountConnected;
		try {
			await inngest.send({ name, data: { emailAccountId, organizationId } });
		} catch (error) {
			this.logService.logAction({
				action: 'inngest.event.enqueue_failed',
				message: `Failed to enqueue backfill for ${emailAccountId}: ${error instanceof Error ? error.message : 'unknown'}`,
				metadata: { provider, emailAccountId, eventName: name },
				level: 'error',
				stack: error instanceof Error ? error.stack : undefined,
				context: 'EmailAccountsService'
			});
		}
	}

	/**
	 * Persist a freshly-completed OAuth handshake. Upserts on
	 * `(organizationId, provider, providerAccountId)` so reconnecting the same mailbox
	 * inside the same org replaces the old tokens rather than duplicating the row.
	 *
	 * **Refresh-token handling differs by provider:**
	 *  - Gmail: refresh_token typically not re-issued on subsequent consents. We fall
	 *    back to the existing encrypted value if the new exchange didn't include one.
	 *  - Microsoft: refresh_token rotates on every exchange. Always trust the new one.
	 *
	 * Either way, the stored ciphertext is `v1:<base64(iv ‖ tag ‖ ct)>`.
	 */
	async upsertEmailAccount(input: UpsertInput): Promise<{ id: string }> {
		const existing = await this.prisma.emailAccount.findUnique({
			where: {
				organizationId_provider_providerAccountId: {
					organizationId: input.organizationId,
					provider: input.provider,
					providerAccountId: input.providerAccountId
				}
			}
		});

		const refreshTokenCipher = input.tokens.refreshToken
			? encrypt(input.tokens.refreshToken)
			: (existing?.refreshToken ?? null);

		if (!refreshTokenCipher) {
			throw new InternalServerErrorException(NO_REFRESH_TOKEN_AVAILABLE);
		}

		const data = {
			email: input.email,
			scope: input.tokens.scope,
			accessToken: encrypt(input.tokens.accessToken),
			refreshToken: refreshTokenCipher,
			accessTokenExpiresAt: input.tokens.expiresAt,
			userId: input.userId,
			// Reactivation: if a previously-disconnected row exists for this provider
			// account, clear the soft-delete marker so it counts as "connected" again.
			// Operational state (`deltaLink`, `historyId`, `subscriptionId`, etc.) is
			// also cleared so backfill captures a fresh cursor + the Inngest pipeline
			// re-registers the watch/subscription. Without this, a re-connect would
			// inherit the stale cursor + over-fetch the entire inbox on the next push.
			disconnectedAt: null,
			deltaLink: null,
			historyId: null,
			subscriptionId: null,
			subscriptionClientState: null,
			watchExpiresAt: null
		};

		const row = await this.prisma.emailAccount.upsert({
			where: {
				organizationId_provider_providerAccountId: {
					organizationId: input.organizationId,
					provider: input.provider,
					providerAccountId: input.providerAccountId
				}
			},
			create: {
				organizationId: input.organizationId,
				provider: input.provider,
				providerAccountId: input.providerAccountId,
				...data
			},
			update: data,
			select: { id: true, disconnectedAt: true }
		});

		if (existing?.disconnectedAt) {
			this.logService.logAction({
				action: 'email.reconnect',
				message: `${input.provider} mailbox reconnected: ${input.email}`,
				metadata: {
					provider: input.provider,
					emailAccountId: row.id,
					email: input.email,
					previousDisconnectedAt: existing.disconnectedAt.toISOString()
				},
				context: 'EmailAccountsService'
			});
		}

		this.logService.logAction({
			action: 'email.connect',
			message: `${input.provider} mailbox connected: ${input.email}`,
			metadata: {
				provider: input.provider,
				emailAccountId: row.id,
				email: input.email,
				scope: input.tokens.scope
			},
			context: 'EmailAccountsService'
		});

		await this.emitConnectedEvent(input.provider, row.id, input.organizationId);

		return row;
	}

	/**
	 * Return THIS user's connected mailbox for the given provider, or null.
	 *
	 * **Side effect:** if the stored access token has already expired (we'd need to
	 * refresh anyway on the next API call), proactively attempt a refresh. If the
	 * provider rejects with `invalid_grant` we delete the row and return null — so the
	 * status endpoint correctly reports "not connected" instead of staying stuck on
	 * stale state after a user revokes our app upstream.
	 */
	async findEmailAccount(scope: MailboxScope) {
		const row = await this.prisma.emailAccount.findFirst({
			where: {
				organizationId: scope.organizationId,
				userId: scope.userId,
				provider: scope.provider,
				disconnectedAt: null
			}
		});
		if (!row) {
			return null;
		}

		const expiresAt = row.accessTokenExpiresAt;
		const isFresh = expiresAt && expiresAt.getTime() - Date.now() > REFRESH_HEAD_START_MS;

		if (!isFresh) {
			try {
				await this.getAccessToken(scope);
			} catch (error) {
				if (error instanceof NotFoundException) {
					return null;
				}
				throw error;
			}
		}

		return this.prisma.emailAccount.findFirst({
			where: {
				organizationId: scope.organizationId,
				userId: scope.userId,
				provider: scope.provider,
				disconnectedAt: null
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
	 * Return a usable access token for THIS user's mailbox. Refreshes via the provider's
	 * `/token` endpoint if the stored token is past (or near) expiry. Writes the new
	 * access token (and rotated refresh token, for Microsoft) back to the row.
	 *
	 * Pass `{ forceRefresh: true }` to bypass the freshness check — required when the
	 * cached token already failed at the provider.
	 *
	 * **Self-healing on revoke:** `invalid_grant` from refresh → delete row + throw
	 * `NotFoundException`. Same shape regardless of provider.
	 */
	async getAccessToken(scope: MailboxScope, opts: { forceRefresh?: boolean } = {}): Promise<string> {
		const row = await this.prisma.emailAccount.findFirst({
			where: {
				organizationId: scope.organizationId,
				userId: scope.userId,
				provider: scope.provider,
				disconnectedAt: null
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

		const refreshToken = decrypt(row.refreshToken);

		let refreshed: ProviderTokenSet;
		try {
			refreshed = await this.oauthFor(scope.provider).refreshAccessToken(refreshToken);
		} catch (error) {
			if (error instanceof OAuthRefreshTokenInvalidException) {
				// Soft-disconnect (not hard-delete): same rationale as user-initiated
				// disconnect — keep the row + its `RawMessage`/`Opportunity` history.
				// `updateMany` is silent on zero rows so parallel self-heal attempts
				// from the same page load (status + messages queries firing together)
				// don't collide.
				await this.prisma.emailAccount.updateMany({
					where: { id: row.id, disconnectedAt: null },
					data: {
						disconnectedAt: new Date(),
						deltaLink: null,
						historyId: null,
						subscriptionId: null,
						subscriptionClientState: null,
						watchExpiresAt: null
					}
				});
				this.logService.logAction({
					action: 'email.disconnect.self_heal',
					message: `${scope.provider} ${row.email} self-healed — refresh token rejected upstream`,
					metadata: {
						provider: scope.provider,
						emailAccountId: row.id,
						email: row.email,
						trigger: 'invalid_grant'
					},
					level: 'warn',
					context: 'EmailAccountsService'
				});
				throw new NotFoundException(EMAIL_ACCOUNT_NOT_FOUND);
			}
			throw error;
		}

		// Microsoft rotates the refresh token; Gmail does not. Always write the new access
		// token; only write a new refresh token if the provider issued one.
		await this.prisma.emailAccount.update({
			where: { id: row.id },
			data: {
				accessToken: encrypt(refreshed.accessToken),
				...(refreshed.refreshToken ? { refreshToken: encrypt(refreshed.refreshToken) } : {}),
				accessTokenExpiresAt: refreshed.expiresAt,
				scope: refreshed.scope
			}
		});

		return refreshed.accessToken;
	}

	/**
	 * Run a callback with a working access token, transparently retrying once if the
	 * provider rejects the cached token with HTTP 401. Use this from any code that
	 * actually calls the mailbox API — it papers over the "cached token looks fresh on
	 * our side but was revoked upstream" gap.
	 *
	 * Flow:
	 *   1. Get a token via `getAccessToken` (cached unless expired).
	 *   2. Run `fn(token)`. If it succeeds → done.
	 *   3. If `fn` throws `MailboxUnauthorizedException`, force a refresh and retry once.
	 *      A second 401 indicates a deeper problem — bubble it up.
	 */
	async withFreshAccessToken<T>(scope: MailboxScope, fn: (accessToken: string) => Promise<T>): Promise<T> {
		const token = await this.getAccessToken(scope);
		try {
			return await fn(token);
		} catch (error) {
			if (!(error instanceof MailboxUnauthorizedException)) {
				throw error;
			}

			this.logService.logAction({
				action: 'email.token.refresh_after_401',
				message: `${scope.provider} returned 401 for org ${scope.organizationId} — forcing refresh + retry`,
				metadata: { provider: scope.provider },
				level: 'warn',
				context: 'EmailAccountsService'
			});
			const refreshed = await this.getAccessToken(scope, { forceRefresh: true });
			return await fn(refreshed);
		}
	}

	/**
	 * Soft-disconnect THIS user's mailbox. Best-effort revoke at the provider (Microsoft
	 * is a no-op), then set `disconnectedAt = now()` + clear operational state (delta
	 * cursors, push-subscription ids). The row stays so `RawMessage` + `Opportunity`
	 * history is preserved — losing months of pipeline work on a transient disconnect
	 * would be a data-loss bug. Re-connecting the same provider account upserts on the
	 * existing row + clears `disconnectedAt`; see `upsertEmailAccount`.
	 *
	 * Idempotent — returns silently if there's no active connection for this user.
	 */
	async disconnectEmailAccount(scope: MailboxScope): Promise<void> {
		const row = await this.prisma.emailAccount.findFirst({
			where: {
				organizationId: scope.organizationId,
				userId: scope.userId,
				provider: scope.provider,
				disconnectedAt: null
			}
		});
		if (!row) {
			return;
		}

		const refreshToken = decrypt(row.refreshToken);
		await this.oauthFor(scope.provider).revoke(refreshToken);

		// `updateMany` (not `update`) so parallel disconnect requests, or a self-heal
		// racing a user-initiated disconnect, can't collide: `updateMany` is silent on
		// zero rows, where `update` throws P2025 for the loser of the race.
		await this.prisma.emailAccount.updateMany({
			where: { id: row.id, disconnectedAt: null },
			data: {
				disconnectedAt: new Date(),
				deltaLink: null,
				historyId: null,
				subscriptionId: null,
				subscriptionClientState: null,
				watchExpiresAt: null
			}
		});
		this.logService.logAction({
			action: 'email.disconnect',
			message: `${scope.provider} mailbox disconnected: ${row.email}`,
			metadata: { provider: scope.provider, emailAccountId: row.id, email: row.email },
			context: 'EmailAccountsService'
		});
	}
}

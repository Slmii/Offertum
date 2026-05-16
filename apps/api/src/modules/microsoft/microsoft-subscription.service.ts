import type { EnvSchema } from '@/config/env.schema';
import { EmailProvider } from '@/generated/prisma/enums';
import { decrypt, encrypt } from '@/lib/crypto/token-encryption';
import { EmailAccountsService, type MailboxScope } from '@/modules/email-accounts/email-accounts.service';
import { LogService } from '@/modules/logger/log.service';
import {
	MicrosoftGraphApiService,
	MicrosoftSubscriptionNotFoundException
} from '@/modules/microsoft/microsoft-graph-api.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';

/**
 * W3.6 — manages the lifecycle of Microsoft Graph push subscriptions.
 *
 * Three responsibilities, mirroring `GmailWatchService`:
 *  - `startSubscriptionForAccount` — called by the backfill completion path. POSTs to
 *    Graph's `/subscriptions`, persists the returned subscription id + expiration +
 *    encrypted clientState.
 *  - `stopSubscriptionForAccount` — called by disconnect. Best-effort DELETE.
 *  - `renewExpiringSubscriptions` — called by `MicrosoftSubscriptionRenewalFunction` on
 *    a cron. PATCHes any row with `watchExpiresAt < NOW() + RENEWAL_WINDOW`.
 *
 * Differences from Gmail:
 *  - 3-day TTL instead of 7 → tighter renewal cadence (the cron runs twice daily).
 *  - PATCH-based renewal (vs Gmail's idempotent "call users.watch again").
 *  - `clientState` shared-secret authentication on incoming pushes instead of JWT/JWKS.
 *    Generated at create-time, stored encrypted (because leaking it would let an attacker
 *    post fake notifications), compared on every webhook hit.
 *
 * `MICROSOFT_GRAPH_NOTIFICATION_URL` is OPTIONAL in env. When unset, every method here
 * no-ops with a structured log instead of throwing — keeps the surrounding flows working
 * locally without forcing ngrok + an Entra subscription to exist.
 */

/** Re-subscribe any row whose expiry is within this window. Graph TTL is ~3 days. */
const RENEWAL_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * How far out to set `expirationDateTime` on create + renew. Graph's hard ceiling for
 * `/me/messages` subscriptions is ~4230 minutes (~2.94 days); we shave a bit off so the
 * server-side clock skew can't push us over. Renewal happens daily via the cron, so the
 * effective subscription stays alive indefinitely.
 */
const SUBSCRIPTION_DURATION_MS = 2 * 24 * 60 * 60 * 1000 + 22 * 60 * 60 * 1000; // ~2d 22h

/** Length of the generated `clientState` shared secret. 32 bytes hex = 64 chars. */
const CLIENT_STATE_BYTES = 32;

export interface MicrosoftRenewalResult {
	scanned: number;
	renewed: number;
	skipped: number;
	failed: number;
}

@Injectable()
export class MicrosoftSubscriptionService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly accounts: EmailAccountsService,
		private readonly api: MicrosoftGraphApiService,
		private readonly config: ConfigService<EnvSchema, true>,
		private readonly logService: LogService
	) {}

	/**
	 * Start a Graph subscription for a single account. Generates a fresh `clientState`
	 * (random 32-byte hex), POSTs to Graph, persists subscription id + expiration +
	 * encrypted clientState on the row.
	 *
	 * Returns `null` when the notification URL isn't configured (dev) so callers can
	 * detect + log that case without treating it as an error.
	 *
	 * NOTE on validation: Graph synchronously calls our `notificationUrl?validationToken=...`
	 * during this POST and expects the plaintext echoed back within ~5 s. The webhook
	 * handler MUST short-circuit on `?validationToken=` before any auth logic. The
	 * webhook controller covers this; failure to handle it surfaces here as a 400 from
	 * `createSubscription`.
	 */
	async startSubscriptionForAccount(emailAccountId: string): Promise<{ expiration: Date } | null> {
		const notificationUrl = this.notificationUrl();
		if (!notificationUrl) {
			this.logService.logAction({
				action: 'email.subscription.skipped_no_url',
				message: 'Skipping Microsoft subscription start — MICROSOFT_GRAPH_NOTIFICATION_URL not configured',
				metadata: { provider: EmailProvider.MICROSOFT, emailAccountId },
				level: 'warn',
				context: 'MicrosoftSubscriptionService'
			});
			return null;
		}

		const account = await this.prisma.emailAccount.findUnique({
			where: { id: emailAccountId },
			select: {
				id: true,
				organizationId: true,
				userId: true,
				email: true,
				provider: true,
				subscriptionId: true
			}
		});
		if (!account || account.provider !== EmailProvider.MICROSOFT || !account.userId) {
			return null;
		}

		const scope = {
			provider: EmailProvider.MICROSOFT,
			organizationId: account.organizationId,
			userId: account.userId
		};

		// Idempotency guard: if the row already has a subscriptionId, stop the old one at
		// Graph first so we don't leak it. The 404 path inside deleteSubscription handles
		// "already gone" silently; other errors are logged but don't block — losing one
		// upstream subscription for the rest of its 3-day TTL is better than failing to
		// register a fresh one.
		if (account.subscriptionId) {
			try {
				await this.accounts.withFreshAccessToken(scope, accessToken =>
					this.api.deleteSubscription(accessToken, account.subscriptionId!)
				);
			} catch (error) {
				this.logService.logAction({
					action: 'email.subscription.replace_stop_failed',
					message: `Failed to stop prior Microsoft subscription before replacing: ${error instanceof Error ? error.message : 'unknown'}`,
					metadata: {
						provider: account.provider,
						emailAccountId,
						priorSubscriptionId: account.subscriptionId
					},
					level: 'warn',
					stack: error instanceof Error ? error.stack : undefined,
					context: 'MicrosoftSubscriptionService'
				});
			}
		}

		const clientState = randomBytes(CLIENT_STATE_BYTES).toString('hex');
		const expirationDateTime = new Date(Date.now() + SUBSCRIPTION_DURATION_MS).toISOString();

		const response = await this.accounts.withFreshAccessToken(scope, accessToken =>
			this.api.createSubscription(accessToken, {
				notificationUrl,
				expirationDateTime,
				clientState
			})
		);

		const expiration = new Date(response.expirationDateTime);
		// `updateMany` not `update`: the account row may have been deleted concurrently by
		// a disconnect that races our backfill-completion callback. `update` would throw
		// P2025 in that window; `updateMany` returns count 0 silently. The leaked Graph
		// subscription on the now-deleted row expires on its own within 3 days.
		await this.prisma.emailAccount.updateMany({
			where: { id: emailAccountId },
			data: {
				subscriptionId: response.id,
				subscriptionClientState: encrypt(clientState),
				watchExpiresAt: expiration
			}
		});

		this.logService.logAction({
			action: 'email.subscription.started',
			message: `Microsoft subscription started for ${account.email} (expires ${expiration.toISOString()})`,
			metadata: {
				provider: account.provider,
				emailAccountId,
				subscriptionId: response.id,
				expiresAt: expiration.toISOString()
			},
			context: 'MicrosoftSubscriptionService'
		});

		return { expiration };
	}

	/**
	 * Scope-based variant: looks up the row by `(org, user, provider)` and delegates to
	 * `stopSubscriptionForAccount`. Lets disconnect handlers stop the subscription without
	 * first reading the EmailAccount ID themselves.
	 */
	async stopSubscriptionForScope(scope: MailboxScope): Promise<void> {
		const row = await this.prisma.emailAccount.findFirst({
			where: {
				organizationId: scope.organizationId,
				userId: scope.userId,
				provider: scope.provider
			},
			select: { id: true }
		});
		if (!row) {
			return;
		}
		await this.stopSubscriptionForAccount(row.id);
	}

	/**
	 * Stop a subscription. Best-effort — Graph 404 means it was already gone, which is
	 * a success state for the caller. Other failures are logged but not rethrown, so
	 * disconnect doesn't fail when Graph has a hiccup.
	 */
	async stopSubscriptionForAccount(emailAccountId: string): Promise<void> {
		const account = await this.prisma.emailAccount.findUnique({
			where: { id: emailAccountId },
			select: {
				id: true,
				organizationId: true,
				userId: true,
				email: true,
				provider: true,
				subscriptionId: true
			}
		});
		if (!account || account.provider !== EmailProvider.MICROSOFT || !account.userId || !account.subscriptionId) {
			return;
		}

		const scope = {
			provider: EmailProvider.MICROSOFT,
			organizationId: account.organizationId,
			userId: account.userId
		};

		try {
			await this.accounts.withFreshAccessToken(scope, accessToken =>
				this.api.deleteSubscription(accessToken, account.subscriptionId!)
			);
			this.logService.logAction({
				action: 'email.subscription.stopped',
				message: `Microsoft subscription stopped for ${account.email}`,
				metadata: { provider: account.provider, emailAccountId, subscriptionId: account.subscriptionId },
				context: 'MicrosoftSubscriptionService'
			});
		} catch (error) {
			this.logService.logAction({
				action: 'email.subscription.stop_failed',
				message: `Failed to stop Microsoft subscription for ${account.email}: ${error instanceof Error ? error.message : 'unknown'}`,
				metadata: { provider: account.provider, emailAccountId, subscriptionId: account.subscriptionId },
				level: 'warn',
				stack: error instanceof Error ? error.stack : undefined,
				context: 'MicrosoftSubscriptionService'
			});
		}
	}

	/**
	 * Find every Microsoft mailbox whose subscription is within the renewal window OR
	 * is orphaned (backfill completed but `start-subscription` step failed: subscriptionId
	 * is NULL but `deltaLink` is set). Renew each by PATCHing the expiration.
	 *
	 * If Graph returns 404 on the PATCH (subscription was deleted upstream), recreate it
	 * by calling `startSubscriptionForAccount` — which generates a new id + clientState
	 * and overwrites the stale ones.
	 *
	 * Each per-account failure is logged but doesn't abort the batch.
	 */
	async renewExpiringSubscriptions(): Promise<MicrosoftRenewalResult> {
		const notificationUrl = this.notificationUrl();
		if (!notificationUrl) {
			this.logService.logAction({
				action: 'email.subscription.renewal.skipped_no_url',
				message: 'Skipping Microsoft subscription renewal — MICROSOFT_GRAPH_NOTIFICATION_URL not configured',
				level: 'warn',
				context: 'MicrosoftSubscriptionService'
			});
			return { scanned: 0, renewed: 0, skipped: 0, failed: 0 };
		}

		const cutoff = new Date(Date.now() + RENEWAL_WINDOW_MS);
		// Orphan-rescue window: any Microsoft EmailAccount created within the last 7 days
		// that doesn't have a subscriptionId is presumed to have failed the post-backfill
		// `start-subscription` step. Older rows without a subscriptionId are assumed to be
		// permanently disconnected (user removed Quoteom from their account, or similar)
		// and we don't want to repeatedly re-register subscriptions for those.
		const orphanCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
		const candidates = await this.prisma.emailAccount.findMany({
			where: {
				provider: EmailProvider.MICROSOFT,
				OR: [
					// Expiring within the renewal window AND has a subscription id to PATCH.
					{ watchExpiresAt: { lt: cutoff }, subscriptionId: { not: null } },
					// Orphan: recently-created EmailAccount with no subscription. Originally
					// keyed off `deltaLink != null` but the backfill never sets deltaLink
					// (the cursor is captured on the FIRST delta-sync run, not at backfill).
					// Switching to "recent + no subscription" catches the post-backfill-
					// failure case without depending on a column that's never populated by
					// the path we want to rescue. (2026-05-17 audit fix.)
					{ subscriptionId: null, createdAt: { gt: orphanCutoff } }
				]
			},
			select: { id: true, subscriptionId: true, organizationId: true, userId: true, email: true, provider: true },
			take: 500
		});

		let renewed = 0;
		let skipped = 0;
		let failed = 0;
		const newExpiration = new Date(Date.now() + SUBSCRIPTION_DURATION_MS).toISOString();

		for (const account of candidates) {
			if (!account.userId) {
				skipped += 1;
				continue;
			}

			try {
				if (account.subscriptionId) {
					// Try to PATCH the existing subscription. If Graph 404s, fall back to
					// recreating via startSubscriptionForAccount.
					const scope = {
						provider: EmailProvider.MICROSOFT,
						organizationId: account.organizationId,
						userId: account.userId
					};
					try {
						const response = await this.accounts.withFreshAccessToken(scope, accessToken =>
							this.api.renewSubscription(accessToken, account.subscriptionId!, newExpiration)
						);
						// `updateMany` not `update` — same race as startSubscriptionForAccount.
						await this.prisma.emailAccount.updateMany({
							where: { id: account.id },
							data: { watchExpiresAt: new Date(response.expirationDateTime) }
						});
						renewed += 1;
					} catch (renewError) {
						// 404 from Graph means the subscription was deleted upstream. Recreate.
						if (renewError instanceof MicrosoftSubscriptionNotFoundException) {
							const result = await this.startSubscriptionForAccount(account.id);
							if (result) {
								renewed += 1;
							} else {
								skipped += 1;
							}
						} else {
							throw renewError;
						}
					}
				} else {
					// Orphan path — create a fresh subscription.
					const result = await this.startSubscriptionForAccount(account.id);
					if (result) {
						renewed += 1;
					} else {
						skipped += 1;
					}
				}
			} catch (error) {
				failed += 1;
				this.logService.logAction({
					action: 'email.subscription.renewal.failed',
					message: `Failed to renew Microsoft subscription for account ${account.id}: ${error instanceof Error ? error.message : 'unknown'}`,
					metadata: {
						provider: EmailProvider.MICROSOFT,
						emailAccountId: account.id,
						subscriptionId: account.subscriptionId
					},
					level: 'error',
					stack: error instanceof Error ? error.stack : undefined,
					context: 'MicrosoftSubscriptionService'
				});
			}
		}

		const result: MicrosoftRenewalResult = {
			scanned: candidates.length,
			renewed,
			skipped,
			failed
		};

		this.logService.logAction({
			action: 'email.subscription.renewal.completed',
			message: `Microsoft subscription renewal: ${result.scanned} candidates, ${result.renewed} renewed, ${result.skipped} skipped, ${result.failed} failed`,
			metadata: { provider: EmailProvider.MICROSOFT, ...result },
			context: 'MicrosoftSubscriptionService'
		});

		return result;
	}

	/**
	 * Decrypt + return the stored `clientState` for an emailAccount. Used by the webhook
	 * controller to compare against the value Graph echoes on every push. Returns null if
	 * the account doesn't exist or isn't Microsoft or has no subscription (the latter
	 * happens during the brief window between create-subscription POST and our row update,
	 * but the webhook validation token short-circuits there too).
	 */
	async getClientStateForAccount(emailAccountId: string): Promise<string | null> {
		const row = await this.prisma.emailAccount.findUnique({
			where: { id: emailAccountId },
			select: { provider: true, subscriptionClientState: true }
		});
		if (!row || row.provider !== EmailProvider.MICROSOFT || !row.subscriptionClientState) {
			return null;
		}
		return decrypt(row.subscriptionClientState);
	}

	private notificationUrl(): string | null {
		const value = this.config.get('MICROSOFT_GRAPH_NOTIFICATION_URL', { infer: true });
		return value && value.length > 0 ? value : null;
	}
}

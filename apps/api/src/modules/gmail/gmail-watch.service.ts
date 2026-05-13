import type { EnvSchema } from '@/config/env.schema';
import { EmailProvider } from '@/generated/prisma/enums';
import { EmailAccountsService } from '@/modules/email-accounts/email-accounts.service';
import { GmailApiService } from '@/modules/gmail/gmail-api.service';
import { LogService } from '@/modules/logger/log.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * W3.5 — manages the lifecycle of Gmail Pub/Sub watch subscriptions.
 *
 * Three responsibilities:
 *  - `startWatchForAccount` — called by the backfill completion path. Tells Gmail to
 *     start pushing notifications to our Pub/Sub topic for this mailbox. Persists the
 *     server-assigned `watchExpiresAt` (~7 days out).
 *  - `stopWatchForAccount` — called by disconnect. Tells Gmail to stop pushing. Best-
 *     effort (failures are logged but don't block disconnect — disconnect's own cleanup
 *     deletes our local row so the push will arrive at a dead address and Gmail will
 *     eventually give up).
 *  - `renewExpiringWatches` — called by `GmailWatchRenewalFunction` on a daily cron.
 *     Re-watches any row with `watchExpiresAt < NOW() + RENEWAL_WINDOW`.
 *
 * `GOOGLE_PUBSUB_TOPIC` is OPTIONAL in env. When unset (typical dev without GCP setup),
 * every method here no-ops with a structured log instead of throwing — keeps the
 * surrounding flows working locally without forcing a GCP project to exist.
 */

/** Re-watch any row whose expiry is within this window. Gmail TTL is ~7 days. */
const RENEWAL_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface RenewalResult {
	scanned: number;
	renewed: number;
	skipped: number;
	failed: number;
}

@Injectable()
export class GmailWatchService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly accounts: EmailAccountsService,
		private readonly api: GmailApiService,
		private readonly config: ConfigService<EnvSchema, true>,
		private readonly logService: LogService
	) {}

	/**
	 * Start the Pub/Sub watch for a single account. Idempotent at the Gmail layer — calling
	 * watch again on an already-watched mailbox just resets the timer. Safe to invoke from
	 * both backfill completion and renewal.
	 *
	 * Returns `null` when the topic isn't configured (dev) so callers can detect + log
	 * that case without treating it as an error.
	 */
	async startWatchForAccount(emailAccountId: string): Promise<{ expiration: Date } | null> {
		const topicName = this.topicName();
		if (!topicName) {
			this.logService.logAction({
				action: 'email.watch.skipped_no_topic',
				message: `Skipping Gmail watch start — GOOGLE_PUBSUB_TOPIC not configured`,
				metadata: { provider: EmailProvider.GMAIL, emailAccountId },
				level: 'warn',
				context: 'GmailWatchService'
			});
			return null;
		}

		const account = await this.prisma.emailAccount.findUnique({
			where: { id: emailAccountId },
			select: { id: true, organizationId: true, userId: true, email: true, provider: true }
		});
		if (!account || account.provider !== EmailProvider.GMAIL || !account.userId) {
			return null;
		}

		const scope = {
			provider: EmailProvider.GMAIL,
			organizationId: account.organizationId,
			userId: account.userId
		};

		const response = await this.accounts.withFreshAccessToken(scope, accessToken =>
			this.api.startWatch(accessToken, topicName)
		);

		const expiration = new Date(Number(response.expiration));
		await this.prisma.emailAccount.update({
			where: { id: emailAccountId },
			data: { watchExpiresAt: expiration }
		});

		this.logService.logAction({
			action: 'email.watch.started',
			message: `Gmail watch started for ${account.email} (expires ${expiration.toISOString()})`,
			metadata: { provider: account.provider, emailAccountId, watchExpiresAt: expiration.toISOString() },
			context: 'GmailWatchService'
		});

		return { expiration };
	}

	/**
	 * Stop the Pub/Sub watch. Best-effort — Gmail's `users.stop` is idempotent (returns 204
	 * even if no watch was active), and any failure is logged but not rethrown. Called from
	 * disconnect BEFORE we delete the row, so disconnect still completes even if Gmail's
	 * stop call hiccups.
	 */
	async stopWatchForAccount(emailAccountId: string): Promise<void> {
		const account = await this.prisma.emailAccount.findUnique({
			where: { id: emailAccountId },
			select: { id: true, organizationId: true, userId: true, email: true, provider: true }
		});
		if (!account || account.provider !== EmailProvider.GMAIL || !account.userId) {
			return;
		}

		const scope = {
			provider: EmailProvider.GMAIL,
			organizationId: account.organizationId,
			userId: account.userId
		};

		try {
			await this.accounts.withFreshAccessToken(scope, accessToken => this.api.stopWatch(accessToken));
			this.logService.logAction({
				action: 'email.watch.stopped',
				message: `Gmail watch stopped for ${account.email}`,
				metadata: { provider: account.provider, emailAccountId },
				context: 'GmailWatchService'
			});
		} catch (error) {
			this.logService.logAction({
				action: 'email.watch.stop_failed',
				message: `Failed to stop Gmail watch for ${account.email}: ${error instanceof Error ? error.message : 'unknown'}`,
				metadata: { provider: account.provider, emailAccountId },
				level: 'warn',
				stack: error instanceof Error ? error.stack : undefined,
				context: 'GmailWatchService'
			});
		}
	}

	/**
	 * Find every Gmail mailbox whose watch is within the renewal window and re-watch it.
	 * Bounded by `MAX_BATCH` to keep a single cron run within Inngest's step timeout if
	 * the system grows large; the cron's daily cadence will catch the rest the next day.
	 *
	 * Each per-account failure is logged but doesn't abort the whole batch — one bad
	 * mailbox shouldn't block renewals for the others.
	 */
	async renewExpiringWatches(): Promise<RenewalResult> {
		const topicName = this.topicName();
		if (!topicName) {
			this.logService.logAction({
				action: 'email.watch.renewal.skipped_no_topic',
				message: 'Skipping Gmail watch renewal — GOOGLE_PUBSUB_TOPIC not configured',
				level: 'warn',
				context: 'GmailWatchService'
			});
			return { scanned: 0, renewed: 0, skipped: 0, failed: 0 };
		}

		const cutoff = new Date(Date.now() + RENEWAL_WINDOW_MS);
		const candidates = await this.prisma.emailAccount.findMany({
			where: {
				provider: EmailProvider.GMAIL,
				watchExpiresAt: { lt: cutoff }
			},
			select: { id: true },
			take: 500
		});

		let renewed = 0;
		let skipped = 0;
		let failed = 0;

		for (const { id } of candidates) {
			try {
				const result = await this.startWatchForAccount(id);
				if (result) {
					renewed += 1;
				} else {
					skipped += 1;
				}
			} catch (error) {
				failed += 1;
				this.logService.logAction({
					action: 'email.watch.renewal.failed',
					message: `Failed to renew Gmail watch for account ${id}: ${error instanceof Error ? error.message : 'unknown'}`,
					metadata: { provider: EmailProvider.GMAIL, emailAccountId: id },
					level: 'error',
					stack: error instanceof Error ? error.stack : undefined,
					context: 'GmailWatchService'
				});
			}
		}

		const result: RenewalResult = { scanned: candidates.length, renewed, skipped, failed };

		this.logService.logAction({
			action: 'email.watch.renewal.completed',
			message: `Gmail watch renewal scan: ${result.scanned} candidates, ${result.renewed} renewed, ${result.skipped} skipped, ${result.failed} failed`,
			metadata: { provider: EmailProvider.GMAIL, ...result },
			context: 'GmailWatchService'
		});

		return result;
	}

	private topicName(): string | null {
		const value = this.config.get('GOOGLE_PUBSUB_TOPIC', { infer: true });
		return value && value.length > 0 ? value : null;
	}
}

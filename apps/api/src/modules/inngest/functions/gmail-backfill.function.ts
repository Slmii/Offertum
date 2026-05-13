import { GmailBackfillService } from '@/modules/gmail/gmail-backfill.service';
import { GmailWatchService } from '@/modules/gmail/gmail-watch.service';
import { inngest } from '@/modules/inngest/inngest.client';
import { InngestEvents, InngestFunctionIds, InngestSteps } from '@/modules/inngest/inngest.constants';
import { LogService } from '@/modules/logger/log.service';
import { Injectable } from '@nestjs/common';
import type { InngestFunction } from 'inngest';

interface GmailAccountConnectedData {
	emailAccountId: string;
}

/**
 * Inngest function wrapper around `GmailBackfillService`. Lives as an `@Injectable()` so
 * it can receive its dependencies via Nest's DI container — `main.ts` resolves the class
 * after `NestFactory.create()` and passes the exposed `inngestFn` into `serve()`.
 *
 * The class itself doesn't run the worker — Inngest does. We just hold the function
 * definition + a `this`-bound handler that delegates straight to the service.
 */
@Injectable()
export class GmailBackfillFunction {
	readonly inngestFn: InngestFunction.Any;

	constructor(
		private readonly backfill: GmailBackfillService,
		private readonly watch: GmailWatchService,
		private readonly logService: LogService
	) {
		this.inngestFn = inngest.createFunction(
			{
				id: InngestFunctionIds.GmailBackfill,
				name: 'Gmail backfill (last 90 days)',
				triggers: [{ event: InngestEvents.GmailAccountConnected }],
				retries: 3
			},
			async ({ event, step }) => {
				const data = event.data as GmailAccountConnectedData;
				if (!data?.emailAccountId) {
					this.logService.logAction({
						action: 'inngest.event.invalid_payload',
						message: 'gmail/account.connected event missing emailAccountId',
						metadata: { event: InngestEvents.GmailAccountConnected, payload: event.data },
						level: 'warn',
						context: 'InngestFn:gmail-backfill'
					});
					return { skipped: true };
				}

				// Backfill in step 1 so Inngest captures the result + replays it on retry.
				// Splitting into per-page steps would give finer-grained resume but adds
				// complexity; do it later if real-world inboxes exceed the timeout.
				const result = await step.run(InngestSteps.GmailBackfill.Backfill, () =>
					this.backfill.run(data.emailAccountId)
				);

				// Step 2 — start the Pub/Sub watch so future mail arrivals fire push pings.
				// Separate step so an Inngest retry on a watch failure doesn't re-run the
				// (expensive, idempotent-but-slow) backfill. Watch failure is swallowed:
				// when GOOGLE_PUBSUB_TOPIC is unset the service returns null and we log a
				// `email.watch.skipped_no_topic` action; otherwise the watch-renewal cron
				// (`gmail-watch-renewal`) picks up any orphaned rows nightly.
				await step.run(InngestSteps.GmailBackfill.StartWatch, async () => {
					try {
						await this.watch.startWatchForAccount(data.emailAccountId);
					} catch (error) {
						this.logService.logAction({
							action: 'email.watch.start_after_backfill_failed',
							message: `Failed to start Gmail watch after backfill for ${data.emailAccountId}: ${error instanceof Error ? error.message : 'unknown'}`,
							metadata: { emailAccountId: data.emailAccountId },
							level: 'error',
							stack: error instanceof Error ? error.stack : undefined,
							context: 'InngestFn:gmail-backfill'
						});
					}
					return { ok: true };
				});

				return result;
			}
		);
	}
}

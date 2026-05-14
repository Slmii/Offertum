import { MicrosoftBackfillService } from '@/modules/microsoft/microsoft-backfill.service';
import { MicrosoftSubscriptionService } from '@/modules/microsoft/microsoft-subscription.service';
import { inngest } from '@/modules/inngest/inngest.client';
import { InngestEvents, InngestFunctionIds, InngestSteps } from '@/modules/inngest/inngest.constants';
import { LogService } from '@/modules/logger/log.service';
import { Injectable } from '@nestjs/common';
import type { InngestFunction } from 'inngest';

interface MicrosoftAccountConnectedData {
	emailAccountId: string;
}

/**
 * Inngest function wrapper around `MicrosoftBackfillService`. Mirrors `GmailBackfillFunction`
 * shape — `@Injectable()` so it receives its dependencies from DI; `main.ts` resolves the
 * class after `NestFactory.create()` and passes `.inngestFn` to `inngestServe()`.
 *
 * Step 1: backfill the last 90 days into `RawMessage`.
 * Step 2: register a Graph subscription so future arrivals fire push pings. Separated so
 *         an Inngest retry on a subscription failure doesn't re-run the expensive backfill.
 *         Subscription failures are swallowed + logged — the renewal cron's orphan path
 *         (`subscriptionId: null, deltaLink: not null`) will rescue accounts where the
 *         post-backfill subscription never registered.
 */
@Injectable()
export class MicrosoftBackfillFunction {
	readonly inngestFn: InngestFunction.Any;

	constructor(
		private readonly backfill: MicrosoftBackfillService,
		private readonly subscriptions: MicrosoftSubscriptionService,
		private readonly logService: LogService
	) {
		this.inngestFn = inngest.createFunction(
			{
				id: InngestFunctionIds.MicrosoftBackfill,
				name: 'Microsoft Graph backfill (last 90 days)',
				triggers: [{ event: InngestEvents.MicrosoftAccountConnected }],
				retries: 3
			},
			async ({ event, step }) => {
				const data = event.data as MicrosoftAccountConnectedData;
				if (!data?.emailAccountId) {
					this.logService.logAction({
						action: 'inngest.event.invalid_payload',
						message: 'microsoft/account.connected event missing emailAccountId',
						metadata: { event: InngestEvents.MicrosoftAccountConnected, payload: event.data },
						level: 'warn',
						context: 'InngestFn:microsoft-backfill'
					});
					return { skipped: true };
				}

				const result = await step.run(InngestSteps.MicrosoftBackfill.Backfill, () =>
					this.backfill.run(data.emailAccountId)
				);

				await step.run(InngestSteps.MicrosoftBackfill.StartSubscription, async () => {
					try {
						await this.subscriptions.startSubscriptionForAccount(data.emailAccountId);
					} catch (error) {
						this.logService.logAction({
							action: 'email.subscription.start_after_backfill_failed',
							message: `Failed to start Microsoft subscription after backfill for ${data.emailAccountId}: ${error instanceof Error ? error.message : 'unknown'}`,
							metadata: { emailAccountId: data.emailAccountId },
							level: 'error',
							stack: error instanceof Error ? error.stack : undefined,
							context: 'InngestFn:microsoft-backfill'
						});
					}
					return { ok: true };
				});

				return result;
			}
		);
	}
}

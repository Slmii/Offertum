import { GmailBackfillService } from '@/modules/gmail/gmail-backfill.service';
import { inngest } from '@/modules/inngest/inngest.client';
import { InngestEvents, InngestFunctionIds, InngestSteps } from '@/modules/inngest/inngest.constants';
import { Injectable, Logger } from '@nestjs/common';
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
	private readonly logger = new Logger('InngestFn:gmail-backfill');

	constructor(private readonly backfill: GmailBackfillService) {
		this.inngestFn = inngest.createFunction(
			{
				id: InngestFunctionIds.GmailBackfill,
				name: 'Gmail backfill (last 30 days)',
				triggers: [{ event: InngestEvents.GmailAccountConnected }],
				// Bound by Inngest. If the run takes longer than this Inngest cancels +
				// retries from the last completed step. 5 min is generous for 30 days of
				// mail; bump if real-world inboxes start tripping it.
				retries: 3
			},
			async ({ event, step }) => {
				const data = event.data as GmailAccountConnectedData;
				if (!data?.emailAccountId) {
					this.logger.warn(`Missing emailAccountId in event: ${JSON.stringify(event.data)}`);
					return { skipped: true };
				}

				// Wrap the work in a single step so Inngest captures the result + replays it
				// on retry. Splitting into per-page steps would give finer-grained resume but
				// adds complexity; do it later if real-world inboxes exceed the timeout.
				const result = await step.run(InngestSteps.GmailBackfill.Backfill, () =>
					this.backfill.run(data.emailAccountId)
				);
				return result;
			}
		);
	}
}

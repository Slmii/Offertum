import { MicrosoftBackfillService } from '@/modules/microsoft/microsoft-backfill.service';
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
 * shape — `@Injectable()` so it receives `MicrosoftBackfillService` from DI; `main.ts`
 * resolves the class after `NestFactory.create()` and adds `.inngestFn` to the array
 * passed to `inngestServe()`.
 */
@Injectable()
export class MicrosoftBackfillFunction {
	readonly inngestFn: InngestFunction.Any;

	constructor(
		private readonly backfill: MicrosoftBackfillService,
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
				return result;
			}
		);
	}
}

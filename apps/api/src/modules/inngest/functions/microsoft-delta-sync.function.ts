import { inngest } from '@/modules/inngest/inngest.client';
import { InngestEvents, InngestFunctionIds, InngestSteps } from '@/modules/inngest/inngest.constants';
import { LogService } from '@/modules/logger/log.service';
import { MicrosoftDeltaSyncService } from '@/modules/microsoft/microsoft-delta-sync.service';
import { Injectable } from '@nestjs/common';
import type { InngestFunction } from 'inngest';

interface MicrosoftDeltaChangedData {
	emailAccountId: string;
}

/**
 * Inngest wrapper around `MicrosoftDeltaSyncService`. Triggered by `microsoft/delta.changed`
 * — emitted by the Microsoft webhook controller (W3.6) when Graph pushes a `created`
 * notification.
 *
 * Concurrency + debounce mirror `GmailDeltaSyncFunction`: bursts of pushes for the same
 * mailbox (e.g. 5 new emails arriving in 1 second) coalesce into a single delta walk
 * that picks up the union of changes since the last cursor. Functionally correct without
 * (the unique index dedupes) but wasteful — N pushes → N parallel walks all racing the
 * cursor write.
 *
 * Retries: 3 with Inngest's default exponential backoff. The delta-sync is idempotent
 * via the `(emailAccountId, providerMessageId)` unique index.
 */
@Injectable()
export class MicrosoftDeltaSyncFunction {
	readonly inngestFn: InngestFunction.Any;

	constructor(
		private readonly deltaSync: MicrosoftDeltaSyncService,
		private readonly logService: LogService
	) {
		this.inngestFn = inngest.createFunction(
			{
				id: InngestFunctionIds.MicrosoftDeltaSync,
				name: 'Microsoft delta sync (push notification)',
				triggers: [{ event: InngestEvents.MicrosoftDeltaChanged }],
				retries: 3,
				concurrency: { limit: 1, key: 'event.data.emailAccountId' },
				debounce: { period: '2s', key: 'event.data.emailAccountId' }
			},
			async ({ event, step }) => {
				const data = event.data as MicrosoftDeltaChangedData;
				if (!data?.emailAccountId) {
					this.logService.logAction({
						action: 'inngest.event.invalid_payload',
						message: 'microsoft/delta.changed event missing emailAccountId',
						metadata: { event: InngestEvents.MicrosoftDeltaChanged, payload: event.data },
						level: 'warn',
						context: 'InngestFn:microsoft-delta-sync'
					});
					return { skipped: true };
				}

				const result = await step.run(InngestSteps.MicrosoftDeltaSync.Sync, () =>
					this.deltaSync.run(data.emailAccountId)
				);
				return result;
			}
		);
	}
}

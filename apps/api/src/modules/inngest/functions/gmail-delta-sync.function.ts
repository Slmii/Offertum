import { GmailDeltaSyncService } from '@/modules/gmail/gmail-delta-sync.service';
import { inngest } from '@/modules/inngest/inngest.client';
import { InngestEvents, InngestFunctionIds, InngestSteps } from '@/modules/inngest/inngest.constants';
import { LogService } from '@/modules/logger/log.service';
import { Injectable } from '@nestjs/common';
import type { InngestFunction } from 'inngest';

interface GmailHistoryChangedData {
	emailAccountId: string;
}

/**
 * Inngest wrapper around `GmailDeltaSyncService`. Triggered by `gmail/history.changed` —
 * emitted by the Gmail webhook controller (W3.5) when Pub/Sub tells us a mailbox changed.
 *
 * Retries: 3 with Inngest's default exponential backoff. The delta-sync is idempotent
 * (the `(emailAccountId, providerMessageId)` unique index makes re-runs harmless), so
 * retries can't double-insert messages even if a retry races a successful first try.
 */
@Injectable()
export class GmailDeltaSyncFunction {
	readonly inngestFn: InngestFunction.Any;

	constructor(
		private readonly deltaSync: GmailDeltaSyncService,
		private readonly logService: LogService
	) {
		this.inngestFn = inngest.createFunction(
			{
				id: InngestFunctionIds.GmailDeltaSync,
				name: 'Gmail delta sync (push notification)',
				triggers: [{ event: InngestEvents.GmailHistoryChanged }],
				retries: 3
			},
			async ({ event, step }) => {
				const data = event.data as GmailHistoryChangedData;
				if (!data?.emailAccountId) {
					this.logService.logAction({
						action: 'inngest.event.invalid_payload',
						message: 'gmail/history.changed event missing emailAccountId',
						metadata: { event: InngestEvents.GmailHistoryChanged, payload: event.data },
						level: 'warn',
						context: 'InngestFn:gmail-delta-sync'
					});
					return { skipped: true };
				}

				const result = await step.run(InngestSteps.GmailDeltaSync.Sync, () =>
					this.deltaSync.run(data.emailAccountId)
				);
				return result;
			}
		);
	}
}

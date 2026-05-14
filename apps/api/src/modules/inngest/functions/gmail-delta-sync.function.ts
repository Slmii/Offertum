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
				retries: 3,
				// Per-mailbox serialization: bursts of pushes (e.g. 10 emails arriving in
				// 1 second) used to spawn 10 parallel delta-sync runs that all walk the
				// same `historyId` cursor, all parallel-fetch the same messages from Gmail,
				// all race to write the cursor back. Functionally correct (unique index
				// dedupes inserts) but 10× wasted quota + cursor regression on every burst.
				// `concurrency.limit: 1` keyed by mailbox serialises them.
				concurrency: { limit: 1, key: 'event.data.emailAccountId' },
				// Coalesce a burst of pushes for the same mailbox into a single run. Each
				// new event within `period` resets the timer; the function fires once the
				// burst settles. The first walk picks up the union of all changes anyway
				// (since history.list returns everything since `startHistoryId`), so most
				// pushes in a burst are redundant.
				debounce: { period: '2s', key: 'event.data.emailAccountId' }
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

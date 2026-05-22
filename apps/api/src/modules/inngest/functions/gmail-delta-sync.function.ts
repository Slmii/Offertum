import { GmailDeltaSyncService } from '@/modules/gmail/gmail-delta-sync.service';
import { defineMailboxPipelineFunction } from '@/modules/inngest/functions/define-mailbox-pipeline-function';
import { InngestEvents, InngestFunctionIds, InngestSteps } from '@/modules/inngest/inngest.constants';
import { LogService } from '@/modules/logger/log.service';
import { OpportunitiesService } from '@/modules/opportunities/opportunities.service';
import { Injectable } from '@nestjs/common';
import type { InngestFunction } from 'inngest';

/**
 * Gmail delta-sync: triggered by `gmail/history.changed` (emitted by the webhook),
 * walks `users.history.list` from the stored cursor, persists new RawMessage rows, then
 * processes them. Per-mailbox concurrency + debounce coalesces push bursts into one walk.
 */
@Injectable()
export class GmailDeltaSyncFunction {
	readonly inngestFn: InngestFunction.Any;

	constructor(deltaSync: GmailDeltaSyncService, opportunities: OpportunitiesService, logService: LogService) {
		this.inngestFn = defineMailboxPipelineFunction({
			functionId: InngestFunctionIds.GmailDeltaSync,
			functionName: 'Gmail delta sync (push notification)',
			triggerEvent: InngestEvents.GmailHistoryChanged,
			retries: 3,
			// Per-mailbox serialization: bursts of pushes used to spawn N parallel walks
			// all racing the same `historyId` cursor. `concurrency.limit: 1` keyed by
			// mailbox serialises them.
			concurrency: { limit: 1, key: 'event.data.emailAccountId' },
			// Coalesce a burst of pushes for the same mailbox into a single run; the
			// first walk picks up the union of all changes since `startHistoryId` anyway.
			debounce: { period: '2s', key: 'event.data.emailAccountId' },
			syncStepName: InngestSteps.GmailDeltaSync.Sync,
			runSync: emailAccountId => deltaSync.run(emailAccountId),
			processOpportunitiesStepPrefix: InngestSteps.GmailDeltaSync.ProcessOpportunitiesBatch,
			opportunities,
			logService,
			logContext: 'InngestFn:gmail-delta-sync',
			mode: 'live'
		});
	}
}

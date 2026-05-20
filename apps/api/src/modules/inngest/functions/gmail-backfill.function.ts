import { GmailBackfillService } from '@/modules/gmail/gmail-backfill.service';
import { GmailWatchService } from '@/modules/gmail/gmail-watch.service';
import { defineMailboxPipelineFunction } from '@/modules/inngest/functions/define-mailbox-pipeline-function';
import { InngestEvents, InngestFunctionIds, InngestSteps } from '@/modules/inngest/inngest.constants';
import { LogService } from '@/modules/logger/log.service';
import { OpportunitiesService } from '@/modules/opportunities/opportunities.service';
import { Injectable } from '@nestjs/common';
import type { InngestFunction } from 'inngest';

/**
 * Gmail backfill: triggered by `gmail/account.connected`, fetches the last 90 days,
 * processes the resulting RawMessages into Opportunities in chunks, and registers a
 * Pub/Sub watch so future arrivals fire push pings. See
 * `define-mailbox-pipeline-function.ts` for the shared scaffolding.
 */
@Injectable()
export class GmailBackfillFunction {
	readonly inngestFn: InngestFunction.Any;

	constructor(
		backfill: GmailBackfillService,
		watch: GmailWatchService,
		opportunities: OpportunitiesService,
		logService: LogService
	) {
		this.inngestFn = defineMailboxPipelineFunction({
			functionId: InngestFunctionIds.GmailBackfill,
			functionName: 'Gmail backfill (last 90 days)',
			triggerEvent: InngestEvents.GmailAccountConnected,
			retries: 3,
			syncStepName: InngestSteps.GmailBackfill.Backfill,
			runSync: emailAccountId => backfill.run(emailAccountId),
			processOpportunitiesStepPrefix: InngestSteps.GmailBackfill.ProcessOpportunitiesBatch,
			opportunities,
			logService,
			logContext: 'InngestFn:gmail-backfill',
			mode: 'backfill',
			postSyncStep: {
				stepName: InngestSteps.GmailBackfill.StartWatch,
				run: emailAccountId => watch.startWatchForAccount(emailAccountId),
				failureAction: 'email.watch.start_after_backfill_failed',
				failureMessage: emailAccountId => `Failed to start Gmail watch after backfill for ${emailAccountId}`
			}
		});
	}
}

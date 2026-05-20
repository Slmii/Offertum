import { defineMailboxPipelineFunction } from '@/modules/inngest/functions/define-mailbox-pipeline-function';
import { InngestEvents, InngestFunctionIds, InngestSteps } from '@/modules/inngest/inngest.constants';
import { LogService } from '@/modules/logger/log.service';
import { MicrosoftBackfillService } from '@/modules/microsoft/microsoft-backfill.service';
import { MicrosoftSubscriptionService } from '@/modules/microsoft/microsoft-subscription.service';
import { OpportunitiesService } from '@/modules/opportunities/opportunities.service';
import { Injectable } from '@nestjs/common';
import type { InngestFunction } from 'inngest';

/**
 * Microsoft backfill mirror of `GmailBackfillFunction`: 90-day fetch, opportunity
 * processing in batches, then start a Graph subscription. Errors during subscription
 * start are swallowed + logged so a subscription failure doesn't re-run the expensive
 * backfill on Inngest retry — the renewal cron picks up orphans nightly.
 */
@Injectable()
export class MicrosoftBackfillFunction {
	readonly inngestFn: InngestFunction.Any;

	constructor(
		backfill: MicrosoftBackfillService,
		subscriptions: MicrosoftSubscriptionService,
		opportunities: OpportunitiesService,
		logService: LogService
	) {
		this.inngestFn = defineMailboxPipelineFunction({
			functionId: InngestFunctionIds.MicrosoftBackfill,
			functionName: 'Microsoft Graph backfill (last 90 days)',
			triggerEvent: InngestEvents.MicrosoftAccountConnected,
			retries: 3,
			syncStepName: InngestSteps.MicrosoftBackfill.Backfill,
			runSync: emailAccountId => backfill.run(emailAccountId),
			processOpportunitiesStepPrefix: InngestSteps.MicrosoftBackfill.ProcessOpportunitiesBatch,
			opportunities,
			logService,
			logContext: 'InngestFn:microsoft-backfill',
			mode: 'backfill',
			postSyncStep: {
				stepName: InngestSteps.MicrosoftBackfill.StartSubscription,
				run: emailAccountId => subscriptions.startSubscriptionForAccount(emailAccountId),
				failureAction: 'email.subscription.start_after_backfill_failed',
				failureMessage: emailAccountId =>
					`Failed to start Microsoft subscription after backfill for ${emailAccountId}`
			}
		});
	}
}

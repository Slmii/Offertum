import { BUSINESS_TIME_ZONE } from '@/lib/time/business-time-zone';
import { ExpiryService } from '@/modules/expiry/expiry.service';
import { inngest } from '@/modules/inngest/inngest.client';
import { InngestFunctionIds, InngestSteps } from '@/modules/inngest/inngest.constants';
import { logContext as requestContext } from '@/modules/logger/log-context';
import { LogService } from '@/modules/logger/log.service';
import { Injectable } from '@nestjs/common';
import type { InngestFunction } from 'inngest';

/**
 * Daily cron that scans SENT quotes drifting toward expiry without a customer reply and
 * turns each into an AI-suggested `ExpiryAction`.
 *
 * Schedule: `TZ=${BUSINESS_TIME_ZONE} 30 6 * * *` — 06:30 local, ahead of the auto-cold
 * scheduler (07:00) so a soon-to-expire quote gets its suggestion before any cooling pass.
 *
 * `ExpiryService.runWatcher` re-enters AsyncLocalStorage per candidate (with that
 * candidate's `organizationId`) so the AICall + Log rows the AI generate() produces land
 * org-tagged; the `{ requestId: runId }` correlation passed here threads the run id so the
 * per-candidate rows and the tick log can be cross-referenced.
 */
@Injectable()
export class ExpiryWatcherFunction {
	readonly inngestFn: InngestFunction.Any;

	constructor(expiry: ExpiryService, logService: LogService) {
		this.inngestFn = inngest.createFunction(
			{
				id: InngestFunctionIds.ExpiryWatcher,
				name: `Expiry watcher (06:30 ${BUSINESS_TIME_ZONE})`,
				triggers: [{ cron: `TZ=${BUSINESS_TIME_ZONE} 30 6 * * *` }],
				retries: 1
			},
			async ({ runId, step }) => {
				const result = await step.run(InngestSteps.ExpiryWatcher.Scan, () =>
					expiry.runWatcher(new Date(), { requestId: runId })
				);

				await requestContext.run({ requestId: runId }, () => {
					logService.logAction({
						action: 'expiry.watcher.tick',
						message: `Expiry watcher scanned ${result.scanned}, inserted ${result.inserted}`,
						metadata: result,
						level: 'log',
						context: 'InngestFn:expiry-watcher'
					});
				});

				return result;
			}
		);
	}
}

import { BUSINESS_TIME_ZONE } from '@/lib/time/business-time-zone';
import { DigestService } from '@/modules/digest/digest.service';
import { inngest } from '@/modules/inngest/inngest.client';
import { InngestFunctionIds, InngestSteps } from '@/modules/inngest/inngest.constants';
import { logContext as requestContext } from '@/modules/logger/log-context';
import { LogService } from '@/modules/logger/log.service';
import { Injectable } from '@nestjs/common';
import type { InngestFunction } from 'inngest';

/**
 * Daily ranked-digest cron. Fires at 07:30 Amsterdam local time (DST-aware via
 * Inngest's TZ= prefix), thirty minutes before the auto-cold scheduler (07:00)
 * and the silence-check-in scheduler (08:00), so users receive the digest before
 * those jobs mutate opportunity states.
 *
 * Delegates entirely to `DigestService.runDailyDigest`, which handles the
 * per-org ranking, idempotency window, and fan-out. The Inngest step boundary
 * ensures Inngest can checkpoint + retry without duplicating work beyond what the
 * 12-hour idempotency window already guards.
 */
@Injectable()
export class DailyDigestFunction {
	readonly inngestFn: InngestFunction.Any;

	constructor(
		private readonly digest: DigestService,
		logService: LogService
	) {
		this.inngestFn = inngest.createFunction(
			{
				id: InngestFunctionIds.DailyDigest,
				name: `Daily digest (07:30 ${BUSINESS_TIME_ZONE})`,
				triggers: [{ cron: `TZ=${BUSINESS_TIME_ZONE} 30 7 * * *` }],
				retries: 1
			},
			async ({ runId, step }) => {
				const result = await step.run(InngestSteps.DailyDigest.Dispatch, async () => {
					return this.digest.runDailyDigest(new Date(), { requestId: runId });
				});

				// Re-establish AsyncLocalStorage context for the tick log so `requestId`
				// is correlatable with the per-org rows written inside runDailyDigest.
				// See CLAUDE.md #8 — ALS context does not propagate across step boundaries.
				await requestContext.run({ requestId: runId }, () => {
					logService.logAction({
						action: 'notification.daily_digest.tick',
						message: `Daily digest tick: dispatched to ${result.recipients} user(s) across ${result.orgs} org(s) (skipped ${result.skippedDuplicate} within idempotency window)`,
						metadata: result,
						level: 'log',
						context: 'InngestFn:daily-digest'
					});
				});

				return result;
			}
		);
	}
}

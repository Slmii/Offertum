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
 * Enumerates entitled orgs in one step, then wraps EACH org's dispatch in its own
 * memoized step. On a retry after a mid-loop failure, Inngest returns the completed
 * orgs' results without re-running them — so already-emailed orgs are never double-sent
 * (the 12h in-app idempotency window is a no-op while in-app defaults off).
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
			async ({ event, runId, step }) => {
				// The SCHEDULED tick, not the host clock at execution time. A run for the 20th
				// that first executes on the 21st must still claim the 20th, or it competes with
				// the 21st's own run for the same period key.
				const now = new Date(event.ts ?? Date.now());

				const orgs = await step.run(InngestSteps.DailyDigest.Dispatch, async () => {
					return this.digest.findDailyDigestOrgs();
				});

				let recipients = 0;
				let skippedDuplicate = 0;
				for (const org of orgs) {
					const result = await step.run(`${InngestSteps.DailyDigest.OrgPrefix}-${org.id}`, async () => {
						return this.digest.dispatchDailyDigestForOrg(org, now, runId);
					});
					recipients += result.recipients;
					skippedDuplicate += result.skippedDuplicate;
				}

				// Re-establish AsyncLocalStorage context for the tick log so `requestId`
				// is correlatable with the per-org rows. CLAUDE.md #8 — ALS does not cross steps.
				await requestContext.run({ requestId: runId }, () => {
					logService.logAction({
						action: 'notification.daily_digest.tick',
						message: `Daily digest tick: dispatched to ${recipients} user(s) across ${orgs.length} org(s)`,
						metadata: { orgs: orgs.length, recipients, skippedDuplicate },
						level: 'log',
						context: 'InngestFn:daily-digest'
					});
				});

				return { orgs: orgs.length, recipients, skippedDuplicate };
			}
		);
	}
}

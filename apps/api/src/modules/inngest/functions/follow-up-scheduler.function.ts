import { BUSINESS_TIME_ZONE } from '@/lib/time/business-time-zone';
import { inngest } from '@/modules/inngest/inngest.client';
import { InngestEvents, InngestFunctionIds, InngestSteps } from '@/modules/inngest/inngest.constants';
import { logContext as requestContext } from '@/modules/logger/log-context';
import { LogService } from '@/modules/logger/log.service';
import { ReplyDraftsRepository } from '@/modules/reply-drafts/reply-drafts.repository';
import { Injectable } from '@nestjs/common';
import type { InngestFunction } from 'inngest';

/**
 * Daily cron that scans REPLIED opportunities and fans out one
 * `opportunity/silence.followup-due` event per eligible row.
 *
 * Schedule: `TZ=${BUSINESS_TIME_ZONE} 0 8 * * *` — 08:00 local ${BUSINESS_TIME_ZONE} time year-round
 * (Inngest resolves DST automatically), so the owner sees fresh check-in drafts the
 * moment they start their workday regardless of summer/winter time.
 *
 * The cron does the enumeration; per-opp work happens in `FollowUpProcessorFunction`
 * via fan-out. Two reasons for the split:
 *  - Inngest parallelises events automatically — processing 50 candidates fans across
 *    50 step.runs instead of one serial loop, so a slow OpenAI call on opp #1 doesn't
 *    block opp #2
 *  - The processor re-validates eligibility (cap, cadence, latest draft status) before
 *    spending an OpenAI call — covers races between the cron tick and the processor
 *    actually running (owner sends a draft, customer replies, etc.)
 *
 * Batch cap on a single tick: 500 candidates. Above that the long tail processes on
 * the next day's tick. Real orgs at MVP scale produce single-digit candidates per day.
 */

const SCHEDULER_BATCH_CAP = 500;

@Injectable()
export class FollowUpSchedulerFunction {
	readonly inngestFn: InngestFunction.Any;

	constructor(repository: ReplyDraftsRepository, logService: LogService) {
		this.inngestFn = inngest.createFunction(
			{
				id: InngestFunctionIds.FollowUpScheduler,
				name: 'Follow-up scheduler (daily)',
				triggers: [{ cron: `TZ=${BUSINESS_TIME_ZONE} 0 8 * * *` }],
				retries: 2
			},
			async ({ runId, step }) => {
				const now = new Date();
				const candidates = await step.run(InngestSteps.FollowUpScheduler.FanOut, () =>
					repository.findCheckInCandidates(now, SCHEDULER_BATCH_CAP)
				);

				// Re-establish AsyncLocalStorage for the tick logs — cross-org enumeration,
				// no organizationId. The runId is the correlation key. See CLAUDE.md #8.
				return requestContext.run({ requestId: runId }, async () => {
					if (candidates.length === 0) {
						logService.logAction({
							action: 'follow_up.scheduler.tick',
							message: 'Follow-up scheduler tick — no eligible candidates',
							metadata: { now: now.toISOString() },
							level: 'log',
							context: 'InngestFn:follow-up-scheduler'
						});
						return { fanOut: 0 };
					}

					await inngest.send(
						candidates.map(c => ({
							name: InngestEvents.OpportunitySilenceFollowupDue,
							data: { opportunityId: c.opportunityId, organizationId: c.organizationId }
						}))
					);

					logService.logAction({
						action: 'follow_up.scheduler.fan_out',
						message: `Follow-up scheduler fanned out ${candidates.length} check-in event(s)`,
						metadata: {
							now: now.toISOString(),
							count: candidates.length,
							batchCapReached: candidates.length === SCHEDULER_BATCH_CAP
						},
						level: 'log',
						context: 'InngestFn:follow-up-scheduler'
					});

					return { fanOut: candidates.length };
				});
			}
		);
	}
}

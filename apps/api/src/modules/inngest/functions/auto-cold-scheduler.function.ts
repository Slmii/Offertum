import { NotificationEventType as PrismaNotificationEventType } from '@/generated/prisma/enums';
import { buildAutoColdEmail } from '@/lib/mails/notifications/auto-cold.email';
import { BUSINESS_TIME_ZONE } from '@/lib/time/business-time-zone';
import { MS_PER_DAY } from '@/lib/time/duration';
import { inngest } from '@/modules/inngest/inngest.client';
import { InngestFunctionIds, InngestSteps } from '@/modules/inngest/inngest.constants';
import { logContext as requestContext } from '@/modules/logger/log-context';
import { LogService } from '@/modules/logger/log.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { OpportunitiesRepository } from '@/modules/opportunities/opportunities.repository';
import { Injectable } from '@nestjs/common';
import { pluralize } from '@offertum/shared';
import type { InngestFunction } from 'inngest';

/**
 * Daily cron that flips REPLIED opportunities to COLD once:
 *   - the silence-check-in budget has been spent (or was disabled with maxCount=0), AND
 *   - the latest SENT draft is older than `org.coldAfterDays` days.
 *
 * Schedule: `TZ=${BUSINESS_TIME_ZONE} 0 7 * * *` — 07:00 local, an hour before the
 * silence-check-in scheduler at 08:00 so the cron sees a stable snapshot before the
 * check-in fan-out generates new drafts (avoiding the "we just generated a check-in,
 * now we're cooling the same opp" thrash within the same morning).
 *
 * Single cron (no fan-out): a status flip is cheap and can't fail per-opp the way an
 * AI draft generation can, so the per-event fan-out the silence-check-in scheduler
 * needs is overkill here. Cap = 500 per tick; long tail processes on the next day.
 *
 * Per flipped opp the cron also dispatches an `opportunity_auto_cold` notification
 * (in-app + email by default) to the mailbox user — same channel-resolution as the
 * other notification events.
 */

const AUTO_COLD_BATCH_CAP = 500;

@Injectable()
export class AutoColdSchedulerFunction {
	readonly inngestFn: InngestFunction.Any;

	constructor(repository: OpportunitiesRepository, notifications: NotificationsService, logService: LogService) {
		this.inngestFn = inngest.createFunction(
			{
				id: InngestFunctionIds.AutoColdScheduler,
				name: `Auto-cold scheduler (daily 07:00 ${BUSINESS_TIME_ZONE})`,
				triggers: [{ cron: `TZ=${BUSINESS_TIME_ZONE} 0 7 * * *` }],
				retries: 1
			},
			async ({ runId, step }) => {
				// Flip + notify are SEPARATE steps. They used to share one step.run, which
				// meant a mid-loop notification failure retried the whole step — but the
				// race-narrowing flip returns [] on the retry (rows already COLD), so every
				// remaining notification was lost permanently. Step memoization now preserves
				// the flip result; each notification retries independently.
				const result = await step.run(InngestSteps.AutoColdScheduler.FlipColdCandidates, async () => {
					const now = new Date();
					const candidates = await repository.findColdCandidates(now, AUTO_COLD_BATCH_CAP);
					if (candidates.length === 0) {
						return { scanned: 0, flipped: 0, notifyTargets: [] };
					}

					const flippedIds = await repository.markOpportunitiesCold(candidates.map(c => c.opportunityId));
					const flippedSet = new Set(flippedIds);

					// Iterate only candidates that ACTUALLY flipped. The race-narrowing UPDATE
					// (`WHERE status = REPLIED`) may have skipped some — typically because the
					// owner manually transitioned the opp between the candidate fetch and the
					// write. Side-effects (notification + audit log) MUST mirror the DB truth.
					const notifyTargets = candidates
						.filter(x => flippedSet.has(x.opportunityId))
						.map(c => ({
							opportunityId: c.opportunityId,
							organizationId: c.organizationId,
							coldAfterDays: c.coldAfterDays,
							customerName: c.customerName,
							requestType: c.requestType,
							mailboxUserId: c.mailboxUserId,
							// Precomputed here — step results are JSON-serialized, so Dates
							// wouldn't survive the step boundary anyway.
							daysSinceSent: Math.max(
								1,
								Math.round((now.getTime() - c.latestSentAt.getTime()) / MS_PER_DAY)
							)
						}));

					for (const target of notifyTargets) {
						// Audit log stays in the flip step: it must fire exactly once per flip,
						// alongside the write it records. Re-establish AsyncLocalStorage
						// per-candidate so the Log row carries `organizationId` on the table
						// column (not just in metadata) — see CLAUDE.md #8.
						await requestContext.run(
							{ requestId: runId, organizationId: target.organizationId },
							async () => {
								logService.logAction({
									action: 'opportunity.auto_cold.flipped',
									message: `Opportunity ${target.opportunityId} auto-flipped REPLIED → COLD after ${target.daysSinceSent} day(s) of silence (threshold=${target.coldAfterDays})`,
									metadata: {
										opportunityId: target.opportunityId,
										organizationId: target.organizationId,
										daysSinceSent: target.daysSinceSent,
										coldAfterDays: target.coldAfterDays
									},
									context: 'InngestFn:auto-cold-scheduler'
								});
							}
						);
					}

					return { scanned: candidates.length, flipped: flippedIds.length, notifyTargets };
				});

				const webOrigin = notifications.webOrigin();
				for (const target of result.notifyTargets) {
					if (!target.mailboxUserId) {
						continue;
					}
					const mailboxUserId = target.mailboxUserId;
					await step.run(
						`${InngestSteps.AutoColdScheduler.NotifyPrefix}-${target.opportunityId}`,
						async () => {
							// Re-establish AsyncLocalStorage inside the step callback (CLAUDE.md #8).
							await requestContext.run(
								{ requestId: runId, organizationId: target.organizationId },
								async () => {
									const opportunityUrl = `${webOrigin}/opportunities/${target.opportunityId}`;
									const customer = target.customerName ?? 'klant';
									const email = buildAutoColdEmail({
										customerName: target.customerName,
										requestType: target.requestType,
										daysSinceSent: target.daysSinceSent,
										opportunityUrl
									});
									await notifications.notifyUsers({
										userIds: [mailboxUserId],
										organizationId: target.organizationId,
										eventType: PrismaNotificationEventType.OPPORTUNITY_AUTO_COLD,
										title: `Aanvraag van ${customer} op koud`,
										body: `${target.requestType} — ${target.daysSinceSent} ${pluralize(target.daysSinceSent, 'dag', 'dagen')} geen reactie`,
										link: `/opportunities/${target.opportunityId}`,
										metadata: {
											daysSinceSent: target.daysSinceSent,
											coldAfterDays: target.coldAfterDays
										},
										email
									});
								}
							);
						}
					);
				}

				// Tick log has no org (cross-org enumeration) — just correlate by runId
				// so it can be cross-referenced with the per-candidate rows.
				await requestContext.run({ requestId: runId }, () => {
					logService.logAction({
						action: 'opportunity.auto_cold.tick',
						message: `Auto-cold tick flipped ${result.flipped}/${result.scanned} candidate(s) to COLD`,
						metadata: {
							scanned: result.scanned,
							flipped: result.flipped,
							batchCapReached: result.scanned === AUTO_COLD_BATCH_CAP
						},
						level: 'log',
						context: 'InngestFn:auto-cold-scheduler'
					});
				});

				return result;
			}
		);
	}
}

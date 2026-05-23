import { NotificationEventType as PrismaNotificationEventType } from '@/generated/prisma/enums';
import { buildAutoColdEmail } from '@/lib/mails/notifications/auto-cold.email';
import { MS_PER_DAY } from '@/lib/time/duration';
import { inngest } from '@/modules/inngest/inngest.client';
import { InngestFunctionIds, InngestSteps } from '@/modules/inngest/inngest.constants';
import { logContext as requestContext } from '@/modules/logger/log-context';
import { LogService } from '@/modules/logger/log.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { OpportunitiesRepository } from '@/modules/opportunities/opportunities.repository';
import { Injectable } from '@nestjs/common';
import type { InngestFunction } from 'inngest';

/**
 * Daily cron that flips REPLIED opportunities to COLD once:
 *   - the silence-check-in budget has been spent (or was disabled with maxCount=0), AND
 *   - the latest SENT draft is older than `org.coldAfterDays` days.
 *
 * Schedule: `TZ=Europe/Amsterdam 0 7 * * *` — 07:00 local, an hour before the
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
				name: 'Auto-cold scheduler (daily 07:00 Amsterdam)',
				triggers: [{ cron: 'TZ=Europe/Amsterdam 0 7 * * *' }],
				retries: 1
			},
			async ({ runId, step }) => {
				const result = await step.run(InngestSteps.AutoColdScheduler.FlipColdCandidates, async () => {
					const now = new Date();
					const candidates = await repository.findColdCandidates(now, AUTO_COLD_BATCH_CAP);
					if (candidates.length === 0) {
						return { scanned: 0, flipped: 0 };
					}

					const flippedIds = await repository.markOpportunitiesCold(candidates.map(c => c.opportunityId));
					const flippedSet = new Set(flippedIds);
					const webOrigin = notifications.webOrigin();

					// Iterate only candidates that ACTUALLY flipped. The race-narrowing UPDATE
					// (`WHERE status = REPLIED`) may have skipped some — typically because the
					// owner manually transitioned the opp between the candidate fetch and the
					// write. Side-effects (notification + audit log) MUST mirror the DB truth.
					for (const c of candidates.filter(x => flippedSet.has(x.opportunityId))) {
						const daysSinceSent = Math.max(
							1,
							Math.round((now.getTime() - c.latestSentAt.getTime()) / MS_PER_DAY)
						);
						// Re-establish AsyncLocalStorage per-candidate so the Log + Notification
						// rows produced inside carry `organizationId` on the table column (not just
						// in metadata) — otherwise org-scoped log queries (the opportunity-detail
						// timeline included) silently exclude them. See CLAUDE.md #8.
						await requestContext.run({ requestId: runId, organizationId: c.organizationId }, async () => {
							logService.logAction({
								action: 'opportunity.auto_cold.flipped',
								message: `Opportunity ${c.opportunityId} auto-flipped REPLIED → COLD after ${daysSinceSent} day(s) of silence (threshold=${c.coldAfterDays})`,
								metadata: {
									opportunityId: c.opportunityId,
									organizationId: c.organizationId,
									daysSinceSent,
									coldAfterDays: c.coldAfterDays
								},
								context: 'InngestFn:auto-cold-scheduler'
							});

							if (c.mailboxUserId) {
								const opportunityUrl = `${webOrigin}/opportunities/${c.opportunityId}`;
								const customer = c.customerName ?? 'klant';
								const email = buildAutoColdEmail({
									customerName: c.customerName,
									requestType: c.requestType,
									daysSinceSent,
									opportunityUrl
								});
								await notifications.notifyUsers({
									userIds: [c.mailboxUserId],
									organizationId: c.organizationId,
									eventType: PrismaNotificationEventType.OPPORTUNITY_AUTO_COLD,
									title: `Aanvraag van ${customer} op koud`,
									body: `${c.requestType} — ${daysSinceSent} dag${daysSinceSent === 1 ? '' : 'en'} geen reactie`,
									link: `/opportunities/${c.opportunityId}`,
									metadata: { daysSinceSent, coldAfterDays: c.coldAfterDays },
									email
								});
							}
						});
					}

					return { scanned: candidates.length, flipped: flippedIds.length };
				});

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

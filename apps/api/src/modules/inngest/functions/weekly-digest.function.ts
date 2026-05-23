import { NotificationEventType as PrismaNotificationEventType } from '@/generated/prisma/enums';
import { buildWeeklyDigestEmail } from '@/lib/mails/notifications/weekly-digest.email';
import { hoursToMs } from '@/lib/time/duration';
import { inngest } from '@/modules/inngest/inngest.client';
import { InngestFunctionIds, InngestSteps } from '@/modules/inngest/inngest.constants';
import { LogService } from '@/modules/logger/log.service';
import { NotificationsRepository } from '@/modules/notifications/notifications.repository';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { Injectable } from '@nestjs/common';
import type { InngestFunction } from 'inngest';

// Weekly digest delivery. Monday 08:00 Amsterdam local time (Inngest's TZ= prefix
// handles DST). Each org's users get one email containing this week's open count +
// cold count + pending auto follow-ups (and estimated value when W11 lands it).
// In-app fan-out is intentional too — the digest also drops a bell-icon entry so
// users who only ever live in the app still see "your weekly summary".
@Injectable()
export class WeeklyDigestFunction {
	readonly inngestFn: InngestFunction.Any;

	constructor(repository: NotificationsRepository, notifications: NotificationsService, logService: LogService) {
		this.inngestFn = inngest.createFunction(
			{
				id: InngestFunctionIds.WeeklyDigest,
				name: 'Weekly digest (Monday 08:00 Amsterdam)',
				triggers: [{ cron: 'TZ=Europe/Amsterdam 0 8 * * 1' }],
				retries: 1
			},
			async ({ step }) => {
				const orgIds = await step.run(InngestSteps.WeeklyDigest.Dispatch, async () => {
					return repository.findEntitledOrganizationIds();
				});

				// Idempotency window — wider than the cron interval but narrower than the
				// next scheduled run, so an Inngest retry within minutes of a successful
				// dispatch skips already-notified users.
				const idempotencyWindowMs = hoursToMs(12);

				let dispatched = 0;
				let skippedDuplicate = 0;
				for (const organizationId of orgIds) {
					const [stats, users] = await Promise.all([
						repository.computeWeeklyDigestStats(organizationId),
						repository.findOrganizationUsers(organizationId)
					]);

					if (users.length === 0) {
						continue;
					}

					const userIds = users.map(u => u.id);
					const alreadyNotified = await repository.findUserIdsWithRecentWeeklyDigest(
						userIds,
						organizationId,
						idempotencyWindowMs
					);
					const recipients = userIds.filter(id => !alreadyNotified.has(id));
					skippedDuplicate += alreadyNotified.size;

					if (recipients.length === 0) {
						continue;
					}

					const email = buildWeeklyDigestEmail({
						openCount: stats.openCount,
						coldCount: stats.coldCount,
						pendingFollowUpCount: stats.pendingFollowUpCount,
						estimatedValueEuros: stats.estimatedValueEuros,
						dashboardUrl: `${notifications.webOrigin()}/`
					});

					await notifications.notifyUsers({
						userIds: recipients,
						organizationId,
						eventType: PrismaNotificationEventType.WEEKLY_DIGEST,
						title: `Wekelijks overzicht: ${stats.openCount} open offerteaanvragen`,
						body: `${stats.coldCount} koud · ${stats.pendingFollowUpCount} follow-ups klaar`,
						link: '/',
						metadata: stats,
						email
					});
					dispatched += recipients.length;
				}

				logService.logAction({
					action: 'notification.weekly_digest.dispatched',
					message: `Weekly digest dispatched to ${dispatched} user(s) across ${orgIds.length} org(s) (skipped ${skippedDuplicate} as already-notified within idempotency window)`,
					metadata: {
						orgs: orgIds.length,
						recipients: dispatched,
						skippedDuplicate
					},
					level: 'log',
					context: 'InngestFn:weekly-digest'
				});

				return { orgs: orgIds.length, recipients: dispatched, skippedDuplicate };
			}
		);
	}
}

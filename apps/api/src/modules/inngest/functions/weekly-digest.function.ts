import { NotificationEventType as PrismaNotificationEventType } from '@/generated/prisma/enums';
import { buildWeeklyDigestEmail } from '@/lib/mails/notifications/weekly-digest.email';
import { inngest } from '@/modules/inngest/inngest.client';
import { InngestFunctionIds, InngestSteps } from '@/modules/inngest/inngest.constants';
import { LogService } from '@/modules/logger/log.service';
import { NotificationsRepository } from '@/modules/notifications/notifications.repository';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { Injectable } from '@nestjs/common';
import { DIGEST_CATCH_UP_MINUTES, isoWeekKey, weeklySlotOffsetMinutes } from '@offertum/shared';
import type { InngestFunction } from 'inngest';

const WEEKDAY_TO_ISO: Record<string, number> = {
	Mon: 1,
	Tue: 2,
	Wed: 3,
	Thu: 4,
	Fri: 5,
	Sat: 6,
	Sun: 7
};

interface LocalMoment {
	isoDay: number;
	year: number;
	month: number;
	day: number;
	hour: number;
	minute: number;
}

// Wall-clock reading of an instant in a timezone. `hourCycle: 'h23'` rather than
// `hour12: false` because the latter renders midnight as "24" in some locales.
function localMoment(timeZone: string, at: Date): LocalMoment {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		hourCycle: 'h23',
		weekday: 'short',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit'
	}).formatToParts(at);
	const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? '';
	return {
		isoDay: WEEKDAY_TO_ISO[value('weekday')] ?? 1,
		year: Number(value('year')),
		month: Number(value('month')),
		day: Number(value('day')),
		hour: Number(value('hour')) % 24,
		minute: Number(value('minute'))
	};
}

/**
 * Weekly digest delivery, on a 15-minute cron.
 *
 * Each tick asks "whose slot is due this week and has not been delivered yet" rather than
 * "whose slot equals this exact tick". The equality version had four failure modes that
 * this one does not: it needed the host clock to agree with Inngest to the second, it lost
 * a week whenever a tick ran late, it sent twice through the hour that repeats when DST
 * ends, and it skipped the hour that does not exist when DST starts.
 *
 * The scheduled tick time comes from `event.ts`, not `new Date()` — the latter is the API
 * host's clock at execution time, so a retry or a slow start silently shifted which slot
 * was targeted.
 *
 * A DigestDelivery row is claimed before each send; the unique index makes concurrent ticks
 * safe, and a failed send releases the claim so the next tick retries.
 */
@Injectable()
export class WeeklyDigestFunction {
	readonly inngestFn: InngestFunction.Any;

	constructor(repository: NotificationsRepository, notifications: NotificationsService, logService: LogService) {
		this.inngestFn = inngest.createFunction(
			{
				id: InngestFunctionIds.WeeklyDigest,
				name: 'Weekly digest (per-user slot, 15-min cron)',
				triggers: [{ cron: '*/15 * * * *' }],
				retries: 1
			},
			async ({ event, step }) => {
				// The scheduled tick, stable across retries. `event.ts` is set by Inngest; the
				// fallback only applies to a manual Invoke from the dev UI.
				const now = new Date(event.ts ?? Date.now());

				const due = await step.run(InngestSteps.WeeklyDigest.Dispatch, async () => {
					const orgs = await repository.findEntitledOrganizationsWithTimeZone();
					if (orgs.length === 0) {
						return [];
					}

					// Group by timezone so the slot maths runs once per distinct zone rather than
					// once per org. Today every org is Europe/Amsterdam, so this is a single pass;
					// it stays correct when more zones are enabled.
					const byTimeZone = new Map<string, string[]>();
					for (const org of orgs) {
						const ids = byTimeZone.get(org.timezone);
						if (ids) {
							ids.push(org.id);
						} else {
							byTimeZone.set(org.timezone, [org.id]);
						}
					}

					const recipients: Array<{
						organizationId: string;
						id: string;
						email: string;
						name: string | null;
						periodKey: string;
					}> = [];

					for (const [timeZone, organizationIds] of byTimeZone) {
						const local = localMoment(timeZone, now);
						const periodKey = isoWeekKey(local.year, local.month, local.day);
						const rows = await repository.findDueDigestRecipients({
							organizationIds,
							eventType: PrismaNotificationEventType.WEEKLY_DIGEST,
							periodKey,
							nowOffsetMinutes: weeklySlotOffsetMinutes(local.isoDay, local.hour, local.minute),
							catchUpMinutes: DIGEST_CATCH_UP_MINUTES
						});
						for (const row of rows) {
							recipients.push({ ...row, periodKey });
						}
					}
					return recipients;
				});

				if (due.length === 0) {
					return { matchedOrgs: 0, recipients: 0 };
				}

				// Only orgs with due recipients get a step — the fan-out is proportional to work,
				// not to org count, so a quiet tick costs one query and nothing else.
				const byOrg = new Map<string, typeof due>();
				for (const row of due) {
					const existing = byOrg.get(row.organizationId);
					if (existing) {
						existing.push(row);
					} else {
						byOrg.set(row.organizationId, [row]);
					}
				}

				let dispatched = 0;
				let matchedOrgs = 0;
				for (const [organizationId, rows] of byOrg) {
					const result = await step.run(`${InngestSteps.WeeklyDigest.OrgPrefix}-${organizationId}`, async () => {
						const periodKey = rows[0].periodKey;
						const targets = rows.map(r => ({ userId: r.id, organizationId }));

						const claimed = await repository.claimDigestDeliveries(
							PrismaNotificationEventType.WEEKLY_DIGEST,
							periodKey,
							targets
						);
						const winners = rows.filter(r => claimed.has(`${organizationId}:${r.id}`));
						if (winners.length === 0) {
							return { recipients: 0 };
						}

						try {
							const stats = await repository.computeWeeklyDigestStats(organizationId);
							const email = buildWeeklyDigestEmail({
								openCount: stats.openCount,
								coldCount: stats.coldCount,
								pendingFollowUpCount: stats.pendingFollowUpCount,
								estimatedValueEuros: stats.estimatedValueEuros,
								dashboardUrl: `${notifications.webOrigin()}/`
							});

							const outcome = await notifications.notifyUsers({
								userIds: winners.map(w => w.id),
								organizationId,
								eventType: PrismaNotificationEventType.WEEKLY_DIGEST,
								title: `Wekelijks overzicht: ${stats.openCount} open offerteaanvragen`,
								body: `${stats.coldCount} koud · ${stats.pendingFollowUpCount} follow-ups klaar`,
								link: '/',
								metadata: stats,
								email
							});

							// Release ONLY the recipients whose email actually failed. Releasing the
							// whole batch would hand a second copy to everyone who did receive it on
							// the next tick.
							if (outcome.failedUserIds.length > 0) {
								await repository.releaseDigestDeliveries(
									PrismaNotificationEventType.WEEKLY_DIGEST,
									periodKey,
									outcome.failedUserIds.map(userId => ({ userId, organizationId }))
								);
							}
							return { recipients: outcome.deliveredUserIds.length };
						} catch (error) {
							// Preparation threw before any send could happen (stats query, template
							// render) — nobody was delivered, so the whole claim is released.
							await repository.releaseDigestDeliveries(
								PrismaNotificationEventType.WEEKLY_DIGEST,
								periodKey,
								winners.map(w => ({ userId: w.id, organizationId }))
							);
							throw error;
						}
					});

					if (result.recipients > 0) {
						matchedOrgs += 1;
						dispatched += result.recipients;
					}
				}

				if (dispatched > 0) {
					logService.logAction({
						action: 'notification.weekly_digest.dispatched',
						message: `Weekly digest dispatched to ${dispatched} user(s) across ${matchedOrgs} org(s)`,
						metadata: { matchedOrgs, recipients: dispatched },
						level: 'log',
						context: 'InngestFn:weekly-digest'
					});
				}

				return { matchedOrgs, recipients: dispatched };
			}
		);
	}
}

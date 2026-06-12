import { NotificationEventType as PrismaNotificationEventType } from '@/generated/prisma/enums';
import { formatEmailEuros } from '@/lib/mails/format';
import { buildDailyDigestEmail } from '@/lib/mails/notifications/daily-digest.email';
import { hoursToMs } from '@/lib/time/duration';
import { ExpiryRepository } from '@/modules/expiry/expiry.repository';
import { logContext as requestContext } from '@/modules/logger/log-context';
import { LogService } from '@/modules/logger/log.service';
import { NotificationsRepository } from '@/modules/notifications/notifications.repository';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DigestRepository } from './digest.repository';
import { rankOpportunities, type RankedOpportunity } from './ranking';
import { resolveWinBaseline } from './win-baseline';
import { VERTICAL_WIN_BASELINE } from './vertical-baselines';

// How many ranked opportunities the daily digest surfaces per org.
const TOP_ITEM_COUNT = 5;
// Time-pressure score above which an item gets the "Verloopt binnenkort" chip.
const TIME_PRESSURE_URGENT = 1.5;

@Injectable()
export class DigestService {
	constructor(
		private readonly digestRepository: DigestRepository,
		private readonly expiryRepository: ExpiryRepository,
		private readonly notifications: NotificationsService,
		private readonly notificationsRepository: NotificationsRepository,
		private readonly logService: LogService
	) {}

	// Daily ranked digest. Mirrors WeeklyDigestFunction's per-org loop + 12h idempotency
	// window: for each entitled org, rank its open opportunities, take the top 5, and
	// fan out one email + in-app notification to every member who hasn't already received
	// a DAILY_DIGEST within the window. The Inngest cron wrapper lands in B4.
	async runDailyDigest(
		now: Date = new Date(),
		correlation: { requestId?: string } = {}
	): Promise<{ orgs: number; recipients: number; skippedDuplicate: number }> {
		const orgs = await this.digestRepository.findEntitledOrganizations();

		// Idempotency window — wider than the cron interval but narrower than the next
		// scheduled run, so a retry within minutes of a successful dispatch skips
		// already-notified users.
		const idempotencyWindowMs = hoursToMs(12);

		// `requestId` is always present on a LogContext; fall back to a fresh UUID when the
		// caller (cron / test) didn't supply one so the per-org rows stay correlatable.
		const requestId = correlation.requestId ?? randomUUID();

		let recipients = 0;
		let skippedDuplicate = 0;
		for (const org of orgs) {
			// Per-org AsyncLocalStorage re-entry (CLAUDE.md #8): the Log rows + notifyUsers
			// internals written inside this loop must carry the org's `organizationId` —
			// without it they'd land with the cron's request-context defaults (NULL org).
			const orgRecipientsAdded = await requestContext.run({ requestId, organizationId: org.id }, async () => {
				// Cheap recipient checks first: an org with no users or whose members were
				// all notified within the idempotency window skips the ranking + expiry
				// queries entirely.
				const users = await this.notificationsRepository.findOrganizationUsers(org.id);
				if (users.length === 0) {
					return 0;
				}

				const userIds = users.map(u => u.id);
				const alreadyNotified = await this.notificationsRepository.findUserIdsWithRecentDigest(
					userIds,
					org.id,
					PrismaNotificationEventType.DAILY_DIGEST,
					idempotencyWindowMs
				);
				const orgRecipients = userIds.filter(id => !alreadyNotified.has(id));
				skippedDuplicate += alreadyNotified.size;

				if (orgRecipients.length === 0) {
					return 0;
				}

				const [opps, { wonCount, lostCount }, callouts] = await Promise.all([
					this.digestRepository.findRankableOpportunities(org.id),
					this.digestRepository.countClosedOutcomes(org.id),
					this.expiryRepository.findExpiringCallouts(org.id, now)
				]);
				const winBaseline = resolveWinBaseline({
					wonCount,
					lostCount,
					tradePrior: VERTICAL_WIN_BASELINE[org.vertical]
				});
				const ranked = rankOpportunities(
					opps,
					{ winBaseline, followUpCadenceDays: org.followUpCadenceDays },
					now
				);
				const topItems = ranked.slice(0, TOP_ITEM_COUNT);
				const totalOpenValueEuros = ranked.reduce((sum, o) => sum + o.quoteNetEuros, 0);
				const expiringItems = callouts.map(c => ({
					customerName: c.customerName,
					daysUntilExpiry: c.daysUntilExpiry,
					opportunityUrl: `${this.notifications.webOrigin()}/opportunities/${c.opportunityId}`
				}));

				const dashboardUrl = `${this.notifications.webOrigin()}/`;
				const email = buildDailyDigestEmail({
					rankedItems: topItems.map(item => ({
						customerName: item.customerName,
						requestType: item.requestType,
						valueEuros: item.quoteNetEuros,
						rankReason: rankReasonFor(item)
					})),
					expiringItems,
					totalOpenValueEuros,
					dashboardUrl
				});

				await this.notifications.notifyUsers({
					userIds: orgRecipients,
					organizationId: org.id,
					eventType: PrismaNotificationEventType.DAILY_DIGEST,
					title: `Vandaag belangrijk: ${topItems.length} offerteaanvragen`,
					body: `${topItems.length} aanvragen vragen vandaag aandacht`,
					link: '/',
					metadata: { ranked: topItems.length, totalOpenValueEuros },
					email
				});
				return orgRecipients.length;
			});
			recipients += orgRecipientsAdded;
		}

		// Cross-org summary — no `organizationId` on this one; wrap only with `requestId`.
		await requestContext.run({ requestId }, () => {
			this.logService.logAction({
				action: 'notification.daily_digest.dispatched',
				message: `Daily digest dispatched to ${recipients} user(s) across ${orgs.length} org(s) (skipped ${skippedDuplicate} as already-notified within idempotency window)`,
				metadata: {
					orgs: orgs.length,
					recipients,
					skippedDuplicate
				},
				level: 'log',
				context: 'DigestService'
			});
		});

		return { orgs: orgs.length, recipients, skippedDuplicate };
	}
}

// Short human-readable chip text for a ranked item: urgency first, then value, then a
// neutral fallback for open-but-unquoted leads.
function rankReasonFor(item: RankedOpportunity): string {
	if (item.timePressure >= TIME_PRESSURE_URGENT) {
		return 'Verloopt binnenkort';
	}

	if (item.quoteNetEuros > 0) {
		return `Waarde ${formatEmailEuros(item.quoteNetEuros)}`;
	}

	return 'Open aanvraag';
}

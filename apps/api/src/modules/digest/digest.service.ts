import { NotificationEventType as PrismaNotificationEventType, Vertical } from '@/generated/prisma/enums';
import { formatEmailEuros } from '@/lib/mails/format';
import { buildDailyDigestEmail } from '@/lib/mails/notifications/daily-digest.email';
import { ExpiryRepository } from '@/modules/expiry/expiry.repository';
import { logContext as requestContext } from '@/modules/logger/log-context';
import { LogService } from '@/modules/logger/log.service';
import { NotificationsRepository } from '@/modules/notifications/notifications.repository';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { Injectable } from '@nestjs/common';
import { isoDayKey, pluralize } from '@offertum/shared';
import { randomUUID } from 'node:crypto';
import { DigestRepository } from './digest.repository';
import { rankOpportunities, type RankedOpportunity } from './ranking';
import { resolveWinBaseline } from './win-baseline';
import { VERTICAL_WIN_BASELINE } from './vertical-baselines';

// Calendar date as it reads on a wall clock in `timeZone` — the daily digest's period key
// must roll over at local midnight, not UTC midnight.
function localCalendarDate(timeZone: string, at: Date): { year: number; month: number; day: number } {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).formatToParts(at);
	const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(p => p.type === type)?.value ?? '0');
	return { year: value('year'), month: value('month'), day: value('day') };
}

// How many ranked opportunities the daily digest surfaces per org.
const TOP_ITEM_COUNT = 5;
// Time-pressure score above which an item gets the "Verloopt binnenkort" chip.
const TIME_PRESSURE_URGENT = 1.5;

type DigestOrg = { id: string; vertical: Vertical; followUpCadenceDays: number };

@Injectable()
export class DigestService {
	constructor(
		private readonly digestRepository: DigestRepository,
		private readonly expiryRepository: ExpiryRepository,
		private readonly notifications: NotificationsService,
		private readonly notificationsRepository: NotificationsRepository,
		private readonly logService: LogService
	) {}

	// Entitled orgs for the daily digest. Exposed so the Inngest cron can enumerate in one step
	// and then wrap each org's dispatch in its own memoized step.
	findDailyDigestOrgs(): Promise<DigestOrg[]> {
		return this.digestRepository.findEntitledOrganizations();
	}

	// Dispatch the daily digest for ONE org. Its own unit so the cron can wrap each call in a
	// memoized Inngest step. Retry-safety comes from the DigestDelivery claim below, which is
	// per (user, org, day) and so holds across separate runs as well as within one.
	// Re-enters AsyncLocalStorage context (CLAUDE.md #8) so per-org Log/notify rows carry the org.
	async dispatchDailyDigestForOrg(
		org: DigestOrg,
		now: Date,
		requestId: string
	): Promise<{ recipients: number; skippedDuplicate: number }> {
		return requestContext.run({ requestId, organizationId: org.id }, async () => {
			// Cheap recipient checks first: an org with no users, or whose members have all been
			// delivered today, skips the ranking + expiry queries entirely.
			const users = await this.notificationsRepository.findOrganizationUsers(org.id);
			if (users.length === 0) {
				return { recipients: 0, skippedDuplicate: 0 };
			}

			const userIds = users.map(u => u.id);
			// Claim today's delivery before doing any work. This replaces the old 12-hour
			// window, which read the Notification table and so only ever guarded users who
			// had opted into in-app — i.e. it was inert for the email-only default. The
			// unique index on DigestDelivery guards everyone.
			const timeZone = await this.notificationsRepository.findOrganizationTimeZone(org.id);
			const local = localCalendarDate(timeZone, now);
			const periodKey = isoDayKey(local.year, local.month, local.day);
			const claimed = await this.notificationsRepository.claimDigestDeliveries(
				PrismaNotificationEventType.DAILY_DIGEST,
				periodKey,
				userIds.map(userId => ({ userId, organizationId: org.id }))
			);
			const orgRecipients = userIds.filter(id => claimed.has(`${org.id}:${id}`));
			const skippedDuplicate = userIds.length - orgRecipients.length;

			if (orgRecipients.length === 0) {
				return { recipients: 0, skippedDuplicate };
			}

			// Everything after the claim lives inside the recovery boundary. A transient failure
			// in the ranking or expiry queries used to leave the claims standing with nothing sent,
			// and the retry would then find nobody left to claim and report success.
			try {
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
				const ranked = rankOpportunities(opps, { winBaseline, followUpCadenceDays: org.followUpCadenceDays }, now);
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

				const outcome = await this.notifications.notifyUsers({
					userIds: orgRecipients,
					organizationId: org.id,
					eventType: PrismaNotificationEventType.DAILY_DIGEST,
					title: `Vandaag belangrijk: ${topItems.length} ${pluralize(topItems.length, 'offerteaanvraag', 'offerteaanvragen')}`,
					body: `${topItems.length} ${pluralize(topItems.length, 'aanvraag vraagt', 'aanvragen vragen')} vandaag aandacht`,
					link: '/',
					metadata: { ranked: topItems.length, totalOpenValueEuros },
					email
				});

				// Release ONLY who actually failed — releasing the whole batch would send a second
				// copy tomorrow to everyone who did receive today's.
				if (outcome.failedUserIds.length > 0) {
					await this.notificationsRepository.releaseDigestDeliveries(
						PrismaNotificationEventType.DAILY_DIGEST,
						periodKey,
						outcome.failedUserIds.map(userId => ({ userId, organizationId: org.id }))
					);
				}
				return { recipients: outcome.deliveredUserIds.length, skippedDuplicate };
			} catch (error) {
				// Threw before any send could happen — nobody was delivered, so the whole claim goes.
				await this.notificationsRepository.releaseDigestDeliveries(
					PrismaNotificationEventType.DAILY_DIGEST,
					periodKey,
					orgRecipients.map(userId => ({ userId, organizationId: org.id }))
				);
				throw error;
			}
		});
	}

	// Daily ranked digest orchestrator. Loops orgs calling `dispatchDailyDigestForOrg`. Used by
	// tests + any non-Inngest caller; the cron drives the same per-org method inside memoized steps.
	async runDailyDigest(
		now: Date = new Date(),
		correlation: { requestId?: string } = {}
	): Promise<{ orgs: number; recipients: number; skippedDuplicate: number }> {
		const orgs = await this.findDailyDigestOrgs();

		// `requestId` is always present on a LogContext; fall back to a fresh UUID when the
		// caller (cron / test) didn't supply one so the per-org rows stay correlatable.
		const requestId = correlation.requestId ?? randomUUID();

		let recipients = 0;
		let skippedDuplicate = 0;
		for (const org of orgs) {
			const result = await this.dispatchDailyDigestForOrg(org, now, requestId);
			recipients += result.recipients;
			skippedDuplicate += result.skippedDuplicate;
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

import { Prisma } from '@/generated/prisma/client';
import {
	NotificationChannel as PrismaNotificationChannel,
	NotificationEventType as PrismaNotificationEventType
} from '@/generated/prisma/enums';
import { ENTITLED_STRIPE_STATUSES } from '@/modules/billing/billing.constants';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import {
	DEFAULT_NOTIFICATION_SETTINGS,
	MINUTES_PER_DAY,
	WEEKLY_DIGEST_DAY_TO_ISO,
	hhmmToMinutes
} from '@offertum/shared';

// The COALESCE fallbacks used by the due-recipient query, derived from the shared default
// rather than repeated as SQL literals — the two drifting apart would silently reschedule
// every user who has never opened the settings page.
const DEFAULT_DIGEST_SLOT = (() => {
	const minutes = hhmmToMinutes(DEFAULT_NOTIFICATION_SETTINGS.weeklyDigestTime) ?? 8 * 60;
	return {
		isoDay: WEEKLY_DIGEST_DAY_TO_ISO[DEFAULT_NOTIFICATION_SETTINGS.weeklyDigestDay],
		hour: Math.floor(minutes / 60),
		minute: minutes % 60
	};
})();

export interface NotificationRecord {
	id: string;
	organizationId: string;
	eventType: PrismaNotificationEventType;
	title: string;
	body: string;
	link: string | null;
	metadata: unknown;
	createdAt: Date;
	readAt: Date | null;
}

export interface NotificationPreferenceRecord {
	eventType: PrismaNotificationEventType;
	channel: PrismaNotificationChannel;
	enabled: boolean;
}

// Storage shape for per-user cadence + quiet-hours. Times are minutes-from-midnight;
// weeklyDigestDay is an ISO weekday (1=Mon..7=Sun).
export interface NotificationSettingRecord {
	weeklyDigestDay: number;
	weeklyDigestHour: number;
	weeklyDigestMinute: number;
	quietHoursEnabled: boolean;
	quietHoursStart: number;
	quietHoursEnd: number;
}

interface CreateNotificationInput {
	userId: string;
	organizationId: string;
	eventType: PrismaNotificationEventType;
	title: string;
	body: string;
	link: string | null;
	metadata: Record<string, unknown> | null;
}

@Injectable()
export class NotificationsRepository {
	constructor(private readonly prisma: PrismaService) {}

	async create(input: CreateNotificationInput): Promise<{ id: string }> {
		const row = await this.prisma.notification.create({
			data: {
				userId: input.userId,
				organizationId: input.organizationId,
				eventType: input.eventType,
				title: input.title,
				body: input.body,
				link: input.link,
				metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined
			},
			select: { id: true }
		});
		return row;
	}

	async listForUser(
		userId: string,
		organizationId: string,
		limit: number
	): Promise<{ notifications: NotificationRecord[]; unreadCount: number }> {
		const [notifications, unreadCount] = await Promise.all([
			this.prisma.notification.findMany({
				where: { userId, organizationId },
				orderBy: { createdAt: 'desc' },
				take: limit
			}),
			this.prisma.notification.count({
				where: { userId, organizationId, readAt: null }
			})
		]);
		return { notifications, unreadCount };
	}

	async markRead(userId: string, organizationId: string, notificationId: string, now: Date): Promise<boolean> {
		const result = await this.prisma.notification.updateMany({
			where: { id: notificationId, userId, organizationId, readAt: null },
			data: { readAt: now }
		});
		return result.count > 0;
	}

	async markAllRead(userId: string, organizationId: string, now: Date): Promise<number> {
		const result = await this.prisma.notification.updateMany({
			where: { userId, organizationId, readAt: null },
			data: { readAt: now }
		});
		return result.count;
	}

	async findPreferences(userId: string, organizationId: string): Promise<NotificationPreferenceRecord[]> {
		return this.prisma.notificationPreference.findMany({
			where: { userId, organizationId },
			select: { eventType: true, channel: true, enabled: true }
		});
	}

	async upsertPreference(
		userId: string,
		organizationId: string,
		eventType: PrismaNotificationEventType,
		channel: PrismaNotificationChannel,
		enabled: boolean
	): Promise<void> {
		await this.prisma.notificationPreference.upsert({
			where: {
				userId_organizationId_eventType_channel: {
					userId,
					organizationId,
					eventType,
					channel
				}
			},
			create: { userId, organizationId, eventType, channel, enabled },
			update: { enabled }
		});
	}

	// Returns the stored opt-in row (or null when no row exists). Default-policy
	// resolution (`null` → on/off per event×channel) lives in NotificationsService so
	// the repo stays a thin DB wrapper.
	async findPreference(
		userId: string,
		organizationId: string,
		eventType: PrismaNotificationEventType,
		channel: PrismaNotificationChannel
	): Promise<boolean | null> {
		const row = await this.prisma.notificationPreference.findUnique({
			where: {
				userId_organizationId_eventType_channel: {
					userId,
					organizationId,
					eventType,
					channel
				}
			},
			select: { enabled: true }
		});
		return row?.enabled ?? null;
	}

	// Recipients for org-wide notifications (weekly digest, future broadcast events).
	// Excludes EXTERNAL members because that role is reserved for contractors/clients
	// who shouldn't see internal analytics like the weekly digest.
	async findOrganizationUsers(
		organizationId: string
	): Promise<Array<{ id: string; email: string; name: string | null }>> {
		const memberships = await this.prisma.membership.findMany({
			where: { organizationId, role: { in: ['OWNER', 'MEMBER'] } },
			select: { user: { select: { id: true, email: true, name: true } } }
		});
		return memberships.map(m => m.user);
	}

	// OWNER user IDs of an org. Recipients of a critical mailbox_issue alongside whoever
	// connected the mailbox — the business owner needs to know lead intake stopped even when a
	// team member owns that inbox, and when the connecting user has been deleted (userId nulled
	// by onDelete: SetNull) the OWNERs are the only recipients left.
	async findOrganizationOwnerIds(organizationId: string): Promise<string[]> {
		const rows = await this.prisma.membership.findMany({
			where: { organizationId, role: 'OWNER' },
			select: { userId: true }
		});
		return rows.map(r => r.userId);
	}

	async findUsersByIds(
		userIds: ReadonlyArray<string>
	): Promise<Array<{ id: string; email: string; name: string | null }>> {
		if (userIds.length === 0) {
			return [];
		}
		return this.prisma.user.findMany({
			where: { id: { in: userIds as string[] } },
			select: { id: true, email: true, name: true }
		});
	}

	// Entitled orgs + their timezone, for the per-user weekly-digest slot matcher — the
	// timezone is what the user's chosen (day, time) is evaluated against. Same STRICT
	// predicate as `EntitlementGuard`: a Subscription row exists AND its status ∈
	// {trialing, active, past_due}. No-subscription / canceled orgs are excluded
	// (INNER JOIN) so the digest matches the W13 write gate exactly.
	async findEntitledOrganizationsWithTimeZone(): Promise<Array<{ id: string; timezone: string }>> {
		return this.prisma.$queryRaw<Array<{ id: string; timezone: string }>>`
			SELECT o."id", o."timezone"
			FROM "Organization" o
			JOIN "Subscription" s ON s."organizationId" = o."id"
			WHERE s."status" = ANY(${ENTITLED_STRIPE_STATUSES as string[]}::text[])
		`;
	}

	// OWNER/MEMBER users across the given orgs whose weekly-digest slot is DUE — that is,
	// the slot has already passed this week (and by no more than `catchUpMinutes`) and no
	// DigestDelivery row exists for this week yet.
	//
	// This is an inequality, not an equality, on purpose. Matching the exact tick had no
	// tolerance for clock skew, dropped a whole week if a tick ran late, sent twice during
	// the repeated DST hour, and skipped the hour that does not exist in spring. "Due and
	// unsent" absorbs all four. The catch-up bound stops a user created mid-week from being
	// handed a digest the instant their already-past default slot is noticed.
	//
	// Users with no NotificationSetting row fall back to DEFAULT_NOTIFICATION_SETTINGS via
	// COALESCE — the defaults are passed in rather than hardcoded so the SQL cannot drift
	// away from the shared constant.
	async findDueDigestRecipients(params: {
		organizationIds: string[];
		eventType: PrismaNotificationEventType;
		periodKey: string;
		nowOffsetMinutes: number;
		catchUpMinutes: number;
	}): Promise<Array<{ organizationId: string; id: string; email: string; name: string | null }>> {
		if (params.organizationIds.length === 0) {
			return [];
		}
		const lowerBound = params.nowOffsetMinutes - params.catchUpMinutes;
		return this.prisma.$queryRaw<
			Array<{ organizationId: string; id: string; email: string; name: string | null }>
		>`
			SELECT m."organizationId", u."id", u."email", u."name"
			FROM "Membership" m
			JOIN "User" u ON u."id" = m."userId"
			LEFT JOIN "NotificationSetting" ns ON ns."userId" = u."id"
			WHERE m."organizationId" = ANY(${params.organizationIds}::uuid[])
			  AND m."role" IN ('OWNER', 'MEMBER')
			  AND (
			        (COALESCE(ns."weeklyDigestDay", ${DEFAULT_DIGEST_SLOT.isoDay}) - 1) * ${MINUTES_PER_DAY}
			      + COALESCE(ns."weeklyDigestHour", ${DEFAULT_DIGEST_SLOT.hour}) * 60
			      + COALESCE(ns."weeklyDigestMinute", ${DEFAULT_DIGEST_SLOT.minute})
			      ) BETWEEN ${lowerBound} AND ${params.nowOffsetMinutes}
			  AND NOT EXISTS (
			        SELECT 1 FROM "DigestDelivery" dd
			        WHERE dd."userId" = u."id"
			          AND dd."organizationId" = m."organizationId"
			          AND dd."eventType" = ${params.eventType}::"NotificationEventType"
			          AND dd."periodKey" = ${params.periodKey}
			      )
		`;
	}

	// Claim delivery for this (user, org, event, period) BEFORE sending. The unique index is
	// the real guard: two ticks racing the same slot both try to insert, exactly one wins, and
	// only the winner sends. Returns the subset that was actually claimed, keyed `orgId:userId`.
	async claimDigestDeliveries(
		eventType: PrismaNotificationEventType,
		periodKey: string,
		targets: ReadonlyArray<{ userId: string; organizationId: string }>
	): Promise<Set<string>> {
		if (targets.length === 0) {
			return new Set();
		}
		const userIds = targets.map(t => t.userId);
		const organizationIds = targets.map(t => t.organizationId);
		const rows = await this.prisma.$queryRaw<Array<{ userId: string; organizationId: string }>>`
			INSERT INTO "DigestDelivery" ("id", "userId", "organizationId", "eventType", "periodKey", "sentAt")
			SELECT gen_random_uuid(), t.user_id, t.org_id, ${eventType}::"NotificationEventType", ${periodKey}, NOW()
			FROM UNNEST(${userIds}::uuid[], ${organizationIds}::uuid[]) AS t(user_id, org_id)
			ON CONFLICT DO NOTHING
			RETURNING "userId", "organizationId"
		`;
		return new Set(rows.map(r => `${r.organizationId}:${r.userId}`));
	}

	// Undo claims when the send throws, so the next tick can retry instead of the period
	// being silently marked delivered.
	async releaseDigestDeliveries(
		eventType: PrismaNotificationEventType,
		periodKey: string,
		targets: ReadonlyArray<{ userId: string; organizationId: string }>
	): Promise<void> {
		if (targets.length === 0) {
			return;
		}
		const userIds = targets.map(t => t.userId);
		const organizationIds = targets.map(t => t.organizationId);
		await this.prisma.$executeRaw`
			DELETE FROM "DigestDelivery" dd
			USING UNNEST(${userIds}::uuid[], ${organizationIds}::uuid[]) AS t(user_id, org_id)
			WHERE dd."userId" = t.user_id
			  AND dd."organizationId" = t.org_id
			  AND dd."eventType" = ${eventType}::"NotificationEventType"
			  AND dd."periodKey" = ${periodKey}
		`;
	}

	async findOrganizationTimeZone(organizationId: string): Promise<string> {
		const org = await this.prisma.organization.findUnique({
			where: { id: organizationId },
			select: { timezone: true }
		});
		return org?.timezone ?? 'Europe/Amsterdam';
	}

	async findSettings(userId: string): Promise<NotificationSettingRecord | null> {
		return this.prisma.notificationSetting.findUnique({
			where: { userId },
			select: {
				weeklyDigestDay: true,
				weeklyDigestHour: true,
				weeklyDigestMinute: true,
				quietHoursEnabled: true,
				quietHoursStart: true,
				quietHoursEnd: true
			}
		});
	}

	async upsertSettings(userId: string, data: NotificationSettingRecord): Promise<void> {
		await this.prisma.notificationSetting.upsert({
			where: { userId },
			create: { userId, ...data },
			update: data
		});
	}


	// Counts the four metrics surfaced by the weekly digest:
	//   - openCount       : non-dismissed opps in NEW / WAITING / COLD / REPLIED (anything
	//                       that's not WON/LOST). The user-facing "open" set.
	//   - coldCount       : non-dismissed opps in COLD.
	//   - pendingFollowUp : opps whose latest draft is a CHECK_IN that isn't sent yet.
	//   - estimatedValue  : sum of ExtractedAmount over open opps (TODO: hook the W11
	//                       quote-amount column when it lands; placeholder returns null).
	async computeWeeklyDigestStats(organizationId: string): Promise<{
		openCount: number;
		coldCount: number;
		pendingFollowUpCount: number;
		estimatedValueEuros: number | null;
	}> {
		const [openCount, coldCount, pendingFollowUpRows] = await Promise.all([
			this.prisma.opportunity.count({
				where: {
					organizationId,
					dismissedAt: null,
					status: { in: ['NEW', 'WAITING', 'COLD', 'REPLIED'] }
				}
			}),
			this.prisma.opportunity.count({
				where: { organizationId, dismissedAt: null, status: 'COLD' }
			}),
			// Latest draft per opp is CHECK_IN AND not sent → count distinct opps.
			this.prisma.opportunity.findMany({
				where: {
					organizationId,
					dismissedAt: null,
					replyDrafts: { some: { kind: 'CHECK_IN' } }
				},
				select: {
					id: true,
					replyDrafts: {
						orderBy: { createdAt: 'desc' },
						take: 1,
						select: { kind: true, status: true }
					}
				}
			})
		]);

		const pendingFollowUpCount = pendingFollowUpRows.filter(opp => {
			const latest = opp.replyDrafts[0];
			return latest?.kind === 'CHECK_IN' && latest.status !== 'SENT';
		}).length;

		return {
			openCount,
			coldCount,
			pendingFollowUpCount,
			estimatedValueEuros: null
		};
	}
}

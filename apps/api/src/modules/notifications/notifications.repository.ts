import { Prisma } from '@/generated/prisma/client';
import {
	NotificationChannel as PrismaNotificationChannel,
	NotificationEventType as PrismaNotificationEventType
} from '@/generated/prisma/enums';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

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

	// Returns orgs that are currently entitled to write — same set as `EntitlementGuard`
	// (subscription status ∈ {trialing, active, past_due} OR no subscription row). Used
	// by the weekly-digest cron so canceled orgs don't keep receiving digests forever.
	async findEntitledOrganizationIds(): Promise<string[]> {
		const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
			SELECT o."id"
			FROM "Organization" o
			LEFT JOIN "Subscription" s ON s."organizationId" = o."id"
			WHERE s."status" IS NULL
			   OR s."status" IN ('trialing', 'active', 'past_due')
		`;
		return rows.map(r => r.id);
	}

	// Idempotency check for the weekly digest. Returns the set of user IDs in `userIds`
	// who already got a WEEKLY_DIGEST notification within the past 24h, so the cron
	// can skip them on retry/re-invoke without double-dispatching.
	async findUserIdsWithRecentWeeklyDigest(
		userIds: ReadonlyArray<string>,
		organizationId: string,
		windowMs: number
	): Promise<Set<string>> {
		if (userIds.length === 0) {
			return new Set();
		}
		const cutoff = new Date(Date.now() - windowMs);
		const rows = await this.prisma.notification.findMany({
			where: {
				userId: { in: userIds as string[] },
				organizationId,
				eventType: PrismaNotificationEventType.WEEKLY_DIGEST,
				createdAt: { gte: cutoff }
			},
			select: { userId: true }
		});
		return new Set(rows.map(r => r.userId));
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

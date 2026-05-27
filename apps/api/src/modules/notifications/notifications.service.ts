import type { EnvSchema } from '@/config/env.schema';
import {
	NotificationChannel as PrismaNotificationChannel,
	NotificationEventType as PrismaNotificationEventType
} from '@/generated/prisma/enums';
import { type RenderedEmail } from '@/lib/mails/notifications/template-shell';
import { sendEmail } from '@/lib/mails/send';
import { LogService } from '@/modules/logger/log.service';
import { NotificationsRepository } from '@/modules/notifications/notifications.repository';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
	NOTIFICATION_CHANNELS,
	NOTIFICATION_EVENT_TYPES,
	NOTIFICATION_LIST_LIMIT,
	defaultNotificationPreference,
	isEmailChannelAvailable,
	type NotificationChannel,
	type NotificationEventType,
	type NotificationListResponse,
	type NotificationPreference,
	type UpdateNotificationPreferencesInput
} from '@offertum/shared';

const WIRE_TO_PRISMA_EVENT: Record<NotificationEventType, PrismaNotificationEventType> = {
	opportunity_created: PrismaNotificationEventType.OPPORTUNITY_CREATED,
	customer_reply: PrismaNotificationEventType.CUSTOMER_REPLY,
	opportunity_auto_cold: PrismaNotificationEventType.OPPORTUNITY_AUTO_COLD,
	weekly_digest: PrismaNotificationEventType.WEEKLY_DIGEST
};

const PRISMA_TO_WIRE_EVENT: Record<PrismaNotificationEventType, NotificationEventType> = {
	OPPORTUNITY_CREATED: 'opportunity_created',
	CUSTOMER_REPLY: 'customer_reply',
	OPPORTUNITY_AUTO_COLD: 'opportunity_auto_cold',
	WEEKLY_DIGEST: 'weekly_digest'
};

const WIRE_TO_PRISMA_CHANNEL: Record<NotificationChannel, PrismaNotificationChannel> = {
	in_app: PrismaNotificationChannel.IN_APP,
	email: PrismaNotificationChannel.EMAIL
};

const PRISMA_TO_WIRE_CHANNEL: Record<PrismaNotificationChannel, NotificationChannel> = {
	IN_APP: 'in_app',
	EMAIL: 'email'
};

interface NotifyRecipient {
	userId: string;
	email: string;
}

interface NotifyInput {
	organizationId: string;
	recipients: ReadonlyArray<NotifyRecipient>;
	eventType: PrismaNotificationEventType;
	title: string;
	body: string;
	link: string | null;
	metadata?: Record<string, unknown>;
	email: RenderedEmail;
}

@Injectable()
export class NotificationsService {
	constructor(
		private readonly repository: NotificationsRepository,
		private readonly logService: LogService,
		private readonly config: ConfigService<EnvSchema, true>
	) {}

	// Dispatches one notification to many recipients. For each recipient, checks the
	// per-channel preference and fans out to IN_APP / EMAIL accordingly. All persistence
	// is best-effort: a single failed send does NOT throw to the caller (the originating
	// event — opportunity created, customer reply, check-in generated — must still
	// commit even if our delivery side-effects fail).
	async notify(input: NotifyInput): Promise<void> {
		await Promise.all(input.recipients.map(recipient => this.deliverToRecipient(input, recipient)));
	}

	// Convenience overload: looks up the recipients' emails by userId, then dispatches.
	// Caller doesn't need to thread email addresses through the call site.
	async notifyUsers(input: Omit<NotifyInput, 'recipients'> & { userIds: ReadonlyArray<string> }): Promise<void> {
		const uniqueIds = Array.from(new Set(input.userIds));
		if (uniqueIds.length === 0) {
			return;
		}
		const users = await this.repository.findUsersByIds(uniqueIds);
		const recipients: NotifyRecipient[] = users.map(u => ({ userId: u.id, email: u.email }));
		await this.notify({ ...input, recipients });
	}

	private async deliverToRecipient(input: NotifyInput, recipient: NotifyRecipient): Promise<void> {
		const { organizationId, eventType, title, body, link, metadata, email } = input;

		const [inAppEnabled, emailEnabled] = await Promise.all([
			this.resolveChannel(recipient.userId, organizationId, eventType, PrismaNotificationChannel.IN_APP),
			this.resolveChannel(recipient.userId, organizationId, eventType, PrismaNotificationChannel.EMAIL)
		]);

		if (inAppEnabled) {
			try {
				await this.repository.create({
					userId: recipient.userId,
					organizationId,
					eventType,
					title,
					body,
					link,
					metadata: metadata ?? null
				});
			} catch (error) {
				this.logService.logAction({
					action: 'notification.in_app.persist_failed',
					message: `Failed to persist in-app notification for user ${recipient.userId}`,
					metadata: {
						eventType,
						userId: recipient.userId,
						organizationId,
						error: error instanceof Error ? error.message : String(error)
					},
					level: 'warn',
					context: 'NotificationsService'
				});
			}
		}

		if (emailEnabled) {
			try {
				await sendEmail({
					to: recipient.email,
					subject: email.subject,
					html: email.html,
					text: email.text,
					devFallbackLog: `[notification:${eventType.toLowerCase()}] → ${recipient.email}: ${title}`
				});
			} catch (error) {
				this.logService.logAction({
					action: 'notification.email.send_failed',
					message: `Failed to send notification email for ${eventType} to ${recipient.email}`,
					metadata: {
						eventType,
						userId: recipient.userId,
						organizationId,
						error: error instanceof Error ? error.message : String(error)
					},
					level: 'warn',
					context: 'NotificationsService'
				});
			}
		}
	}

	webOrigin(): string {
		return this.config.get('WEB_ORIGIN', { infer: true });
	}

	private async resolveChannel(
		userId: string,
		organizationId: string,
		eventType: PrismaNotificationEventType,
		channel: PrismaNotificationChannel
	): Promise<boolean> {
		const wireEvent = PRISMA_TO_WIRE_EVENT[eventType];
		const wireChannel = PRISMA_TO_WIRE_CHANNEL[channel];
		// Email channel is only exposed for a curated set of events. Refuse dispatch
		// for anything outside that set even if a stale opt-in row says otherwise —
		// the policy lives in shared so settings UI + service stay in lockstep.
		if (wireChannel === 'email' && !isEmailChannelAvailable(wireEvent)) {
			return false;
		}
		const stored = await this.repository.findPreference(userId, organizationId, eventType, channel);
		if (stored !== null) {
			return stored;
		}
		return defaultNotificationPreference(wireEvent, wireChannel);
	}

	async listForUser(userId: string, organizationId: string): Promise<NotificationListResponse> {
		const { notifications, unreadCount } = await this.repository.listForUser(
			userId,
			organizationId,
			NOTIFICATION_LIST_LIMIT
		);
		return {
			unreadCount,
			notifications: notifications.map(n => ({
				id: n.id,
				organizationId: n.organizationId,
				eventType: PRISMA_TO_WIRE_EVENT[n.eventType],
				title: n.title,
				body: n.body,
				link: n.link,
				createdAt: n.createdAt.toISOString(),
				readAt: n.readAt?.toISOString() ?? null
			}))
		};
	}

	async markRead(userId: string, organizationId: string, notificationId: string): Promise<void> {
		await this.repository.markRead(userId, organizationId, notificationId, new Date());
	}

	async markAllRead(userId: string, organizationId: string): Promise<number> {
		return this.repository.markAllRead(userId, organizationId, new Date());
	}

	async getPreferences(userId: string, organizationId: string): Promise<NotificationPreference[]> {
		const rows = await this.repository.findPreferences(userId, organizationId);
		const byKey = new Map<string, boolean>();
		for (const row of rows) {
			byKey.set(`${row.eventType}|${row.channel}`, row.enabled);
		}

		const preferences: NotificationPreference[] = [];
		for (const eventType of NOTIFICATION_EVENT_TYPES) {
			for (const channel of NOTIFICATION_CHANNELS) {
				// Skip channels that aren't user-toggleable for this event (currently
				// the email channel for non-digest events). Keeps the wire shape in
				// sync with what the settings UI actually renders.
				if (channel === 'email' && !isEmailChannelAvailable(eventType)) {
					continue;
				}
				const key = `${WIRE_TO_PRISMA_EVENT[eventType]}|${WIRE_TO_PRISMA_CHANNEL[channel]}`;
				const enabled = byKey.get(key) ?? defaultNotificationPreference(eventType, channel);
				preferences.push({ eventType, channel, enabled });
			}
		}
		return preferences;
	}

	async updatePreferences(
		userId: string,
		organizationId: string,
		input: UpdateNotificationPreferencesInput
	): Promise<void> {
		// Drop incoming rows for disabled (event, channel) pairs — currently any
		// email row for a non-digest event. Stale clients or hand-crafted requests
		// can't sneak past the policy.
		const acceptable = input.preferences.filter(
			pref => pref.channel !== 'email' || isEmailChannelAvailable(pref.eventType)
		);

		await Promise.all(
			acceptable.map(pref =>
				this.repository.upsertPreference(
					userId,
					organizationId,
					WIRE_TO_PRISMA_EVENT[pref.eventType],
					WIRE_TO_PRISMA_CHANNEL[pref.channel],
					pref.enabled
				)
			)
		);

		this.logService.logAction({
			action: 'notification.preferences.updated',
			message: `Notification preferences updated for user ${userId}`,
			metadata: {
				userId,
				organizationId,
				updatedCount: acceptable.length,
				droppedCount: input.preferences.length - acceptable.length
			},
			level: 'log',
			context: 'NotificationsService'
		});
	}
}

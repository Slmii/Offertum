import type { EnvSchema } from '@/config/env.schema';
import {
	NotificationChannel as PrismaNotificationChannel,
	NotificationEventType as PrismaNotificationEventType
} from '@/generated/prisma/enums';
import { type RenderedEmail } from '@/lib/mails/notifications/template-shell';
import { sendEmail } from '@/lib/mails/send';
import {
	INVALID_NOTIFICATION_SETTINGS_DAY,
	INVALID_NOTIFICATION_SETTINGS_TIME,
	INVALID_QUIET_HOURS_RANGE
} from '@/lib/errors';
import { LogService } from '@/modules/logger/log.service';
import { NotificationsRepository } from '@/modules/notifications/notifications.repository';
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
	DEFAULT_NOTIFICATION_SETTINGS,
	NOTIFICATION_CHANNELS,
	NOTIFICATION_LIST_LIMIT,
	PREFERENCE_EVENT_TYPES,
	WEEKLY_DIGEST_DAY_TO_ISO,
	WEEKLY_DIGEST_ISO_TO_DAY,
	defaultNotificationPreference,
	hhmmToMinutes,
	isCriticalEvent,
	isEmailChannelAvailable,
	isWithinQuietHours,
	minutesToHHMM,
	snapMinutesToGrid,
	type NotificationChannel,
	type NotificationEventType,
	type NotificationListResponse,
	type NotificationPreference,
	type NotificationSettings,
	type UpdateNotificationPreferencesInput,
	type UpdateNotificationSettingsInput,
	type WeeklyDigestDay
} from '@offertum/shared';

const WIRE_TO_PRISMA_EVENT: Record<NotificationEventType, PrismaNotificationEventType> = {
	opportunity_created: PrismaNotificationEventType.OPPORTUNITY_CREATED,
	customer_reply: PrismaNotificationEventType.CUSTOMER_REPLY,
	opportunity_auto_cold: PrismaNotificationEventType.OPPORTUNITY_AUTO_COLD,
	weekly_digest: PrismaNotificationEventType.WEEKLY_DIGEST,
	daily_digest: PrismaNotificationEventType.DAILY_DIGEST,
	mailbox_issue: PrismaNotificationEventType.MAILBOX_ISSUE
};

const PRISMA_TO_WIRE_EVENT: Record<PrismaNotificationEventType, NotificationEventType> = {
	OPPORTUNITY_CREATED: 'opportunity_created',
	CUSTOMER_REPLY: 'customer_reply',
	OPPORTUNITY_AUTO_COLD: 'opportunity_auto_cold',
	WEEKLY_DIGEST: 'weekly_digest',
	DAILY_DIGEST: 'daily_digest',
	MAILBOX_ISSUE: 'mailbox_issue'
};

// Current wall-clock minutes-from-midnight in an IANA timezone (DST-correct via Intl).
function nowMinutesInTimeZone(timeZone: string, now: Date): number {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		hour12: false,
		hour: '2-digit',
		minute: '2-digit'
	}).formatToParts(now);
	const hour = Number(parts.find(p => p.type === 'hour')?.value ?? '0') % 24;
	const minute = Number(parts.find(p => p.type === 'minute')?.value ?? '0');
	return hour * 60 + minute;
}

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

// Per-recipient delivery outcome. `notify` still never throws to its caller — an
// originating event must commit even if our side-effects fail — but it now REPORTS what
// happened, which callers that hold a delivery claim (the digests) and callers that want
// Inngest to retry (the mailbox alert) both need. Swallowing the failure silently made
// both of those mechanisms dead code.
//
// "Delivered" tracks the EMAIL channel only: an in-app persist failure stays best-effort,
// because re-sending an entire digest email to recover a missing bell row is worse than
// the missing row.
export interface NotifyOutcome {
	deliveredUserIds: string[];
	failedUserIds: string[];
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
	async notify(input: NotifyInput): Promise<NotifyOutcome> {
		// Resolve the org's timezone once per dispatch rather than once per recipient, and
		// only when quiet hours can actually apply to this event.
		const nowMinutes = this.quietHoursApplyTo(input.eventType)
			? nowMinutesInTimeZone(await this.repository.findOrganizationTimeZone(input.organizationId), new Date())
			: null;

		// allSettled, not all: one recipient's failure must not abandon the others
		// mid-flight, and the caller needs a per-recipient verdict rather than one
		// rejection that says nothing about who actually got the mail.
		const settled = await Promise.allSettled(
			input.recipients.map(recipient => this.deliverToRecipient(input, recipient, nowMinutes))
		);

		const deliveredUserIds: string[] = [];
		const failedUserIds: string[] = [];
		settled.forEach((result, index) => {
			const userId = input.recipients[index]!.userId;
			if (result.status === 'fulfilled' && result.value) {
				deliveredUserIds.push(userId);
			} else {
				failedUserIds.push(userId);
			}
		});
		return { deliveredUserIds, failedUserIds };
	}

	// Convenience overload: looks up the recipients' emails by userId, then dispatches.
	// Caller doesn't need to thread email addresses through the call site.
	async notifyUsers(
		input: Omit<NotifyInput, 'recipients'> & { userIds: ReadonlyArray<string> }
	): Promise<NotifyOutcome> {
		const uniqueIds = Array.from(new Set(input.userIds));
		if (uniqueIds.length === 0) {
			return { deliveredUserIds: [], failedUserIds: [] };
		}
		const users = await this.repository.findUsersByIds(uniqueIds);
		const recipients: NotifyRecipient[] = users.map(u => ({ userId: u.id, email: u.email }));
		const outcome = await this.notify({ ...input, recipients });
		// A requested user id with no User row never reached a channel — report it as failed
		// rather than letting it vanish between the lookup and the outcome.
		const seen = new Set(users.map(u => u.id));
		return {
			...outcome,
			failedUserIds: [...outcome.failedUserIds, ...uniqueIds.filter(id => !seen.has(id))]
		};
	}

	private async deliverToRecipient(
		input: NotifyInput,
		recipient: NotifyRecipient,
		nowMinutes: number | null
	): Promise<boolean> {
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

		if (!emailEnabled || (await this.isEmailSuppressedByQuietHours(recipient.userId, nowMinutes))) {
			// Nothing to deliver on the email channel: not a failure.
			return true;
		}

		{
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
				return false;
			}
		}
		return true;
	}

	// Can quiet hours ever suppress this event? Critical events always break through, and
	// digests are exempt because the user picked their delivery time deliberately — quiet
	// hours are for reactive, interruptive email, not for the summary you asked for.
	private quietHoursApplyTo(eventType: PrismaNotificationEventType): boolean {
		const wireEvent = PRISMA_TO_WIRE_EVENT[eventType];
		return !isCriticalEvent(wireEvent) && wireEvent !== 'weekly_digest' && wireEvent !== 'daily_digest';
	}

	// Quiet hours suppress non-critical EMAIL only — in-app rows are passive and still
	// persist, so the bell shows them next time the owner looks. `nowMinutes` is the
	// org-timezone wall clock resolved once per dispatch in `notify`; null means quiet
	// hours cannot apply to this event at all.
	private async isEmailSuppressedByQuietHours(userId: string, nowMinutes: number | null): Promise<boolean> {
		if (nowMinutes === null) {
			return false;
		}
		const settings = await this.repository.findSettings(userId);
		if (!settings || !settings.quietHoursEnabled) {
			return false;
		}
		return isWithinQuietHours(nowMinutes, settings.quietHoursStart, settings.quietHoursEnd);
	}

	webOrigin(): string {
		return this.config.get('WEB_ORIGIN', { infer: true });
	}

	// OWNER user IDs of an org — fallback recipients for a critical notification with no direct user.
	async findOrganizationOwnerIds(organizationId: string): Promise<string[]> {
		return this.repository.findOrganizationOwnerIds(organizationId);
	}

	private async resolveChannel(
		userId: string,
		organizationId: string,
		eventType: PrismaNotificationEventType,
		channel: PrismaNotificationChannel
	): Promise<boolean> {
		const wireEvent = PRISMA_TO_WIRE_EVENT[eventType];
		const wireChannel = PRISMA_TO_WIRE_CHANNEL[channel];
		// Critical events (mailbox_issue) are always delivered on every channel — there's
		// no opt-out row and no default lookup.
		if (isCriticalEvent(wireEvent)) {
			return true;
		}
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
		for (const eventType of PREFERENCE_EVENT_TYPES) {
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
		// Drop incoming rows the policy doesn't allow: critical events (not user-configurable)
		// and email rows for events without an email channel. Stale clients or hand-crafted
		// requests can't sneak past the policy.
		const acceptable = input.preferences.filter(
			pref =>
				!isCriticalEvent(pref.eventType) &&
				(pref.channel !== 'email' || isEmailChannelAvailable(pref.eventType))
		);

		// Dedup by (event, channel), last-write-wins — two rows for the same key would otherwise
		// upsert concurrently against the same unique constraint (nondeterministic result / P2002).
		const byKey = new Map<string, (typeof acceptable)[number]>();
		for (const pref of acceptable) {
			byKey.set(`${pref.eventType}|${pref.channel}`, pref);
		}
		const deduped = [...byKey.values()];

		await Promise.all(
			deduped.map(pref =>
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
				updatedCount: deduped.length,
				droppedCount: input.preferences.length - deduped.length
			},
			level: 'log',
			context: 'NotificationsService'
		});
	}

	// ── Cadence + quiet-hours settings (the "Cadans" card) ───────────────────
	// Person-scoped (userId only, org-independent). A missing row yields the shared
	// defaults so a fresh user reads sensible values.

	async getSettings(userId: string): Promise<NotificationSettings> {
		const row = await this.repository.findSettings(userId);
		if (!row) {
			return DEFAULT_NOTIFICATION_SETTINGS;
		}
		return {
			weeklyDigestDay: WEEKLY_DIGEST_ISO_TO_DAY[row.weeklyDigestDay] ?? DEFAULT_NOTIFICATION_SETTINGS.weeklyDigestDay,
			weeklyDigestTime: minutesToHHMM(row.weeklyDigestHour * 60 + row.weeklyDigestMinute),
			quietHoursStart: minutesToHHMM(row.quietHoursStart),
			quietHoursEnd: minutesToHHMM(row.quietHoursEnd),
			quietHoursEnabled: row.quietHoursEnabled
		};
	}

	async updateSettings(userId: string, input: UpdateNotificationSettingsInput): Promise<void> {
		const digestMinutes = hhmmToMinutes(input.weeklyDigestTime);
		const quietStart = hhmmToMinutes(input.quietHoursStart);
		const quietEnd = hhmmToMinutes(input.quietHoursEnd);
		if (digestMinutes === null || quietStart === null || quietEnd === null) {
			throw new BadRequestException(INVALID_NOTIFICATION_SETTINGS_TIME);
		}
		// A zero-length window is empty, not "always quiet" — accepting it would leave the
		// toggle reading enabled while every email still went out.
		if (input.quietHoursEnabled && quietStart === quietEnd) {
			throw new BadRequestException(INVALID_QUIET_HOURS_RANGE);
		}
		const snappedDigestMinutes = snapMinutesToGrid(digestMinutes);
		const day = WEEKLY_DIGEST_DAY_TO_ISO[input.weeklyDigestDay as WeeklyDigestDay];
		if (day === undefined) {
			throw new BadRequestException(INVALID_NOTIFICATION_SETTINGS_DAY);
		}

		await this.repository.upsertSettings(userId, {
			weeklyDigestDay: day,
			// Snap the whole time to the 15-minute grid, not the minute in isolation — the
			// latter could not carry into the hour, so 08:55 became 08:45 (ten minutes
			// earlier) instead of 09:00.
			weeklyDigestHour: Math.floor(snappedDigestMinutes / 60),
			weeklyDigestMinute: snappedDigestMinutes % 60,
			quietHoursEnabled: input.quietHoursEnabled,
			quietHoursStart: quietStart,
			quietHoursEnd: quietEnd
		});

		this.logService.logAction({
			action: 'notification.settings.updated',
			message: `Notification settings updated for user ${userId}`,
			metadata: { userId },
			level: 'log',
			context: 'NotificationsService'
		});
	}
}

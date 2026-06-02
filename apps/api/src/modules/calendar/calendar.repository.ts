// apps/api/src/modules/calendar/calendar.repository.ts
import { ReplyDraftKind, ReplyDraftStatus } from '@/generated/prisma/enums';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import type { CalendarEventScope } from '@offertum/shared';
import type { CalendarEventSource } from './calendar-event.mapper';

@Injectable()
export class CalendarRepository {
	constructor(private readonly prisma: PrismaService) {}

	/**
	 * Fetch every active (non-dismissed) opportunity in the org plus the per-opp fields the
	 * mapper needs: sent quote drafts, the latest SENT reply-draft timestamp, and how many
	 * CHECK_IN drafts have already been generated (the follow-up cap counter). `scope=mine`
	 * narrows to opps assigned to `requestingUserId`. Returns the mapper's input shape so the
	 * service can map without a second transform.
	 */
	async findActiveSources(
		organizationId: string,
		scope: CalendarEventScope,
		requestingUserId: string | null
	): Promise<CalendarEventSource[]> {
		const opportunities = await this.prisma.opportunity.findMany({
			where: {
				organizationId,
				dismissedAt: null,
				...(scope === 'mine' && requestingUserId ? { assignedToUserId: requestingUserId } : {})
			},
			select: {
				id: true,
				status: true,
				dismissedAt: true,
				customerName: true,
				customerDeadline: true,
				customerAppointment: true,
				quoteDrafts: {
					where: { sentAt: { not: null } },
					select: { id: true, sentAt: true }
				},
				replyDrafts: {
					where: { status: ReplyDraftStatus.SENT, sentAt: { not: null } },
					orderBy: { sentAt: 'desc' },
					select: { sentAt: true, kind: true }
				}
			}
		});

		return opportunities.map(opp => {
			const latestSentReplyDraftAt = opp.replyDrafts[0]?.sentAt ?? null;
			const priorCheckInCount = opp.replyDrafts.filter(draft => draft.kind === ReplyDraftKind.CHECK_IN).length;
			return {
				opportunityId: opp.id,
				status: opp.status,
				dismissedAt: opp.dismissedAt,
				customerName: opp.customerName,
				customerDeadline: opp.customerDeadline,
				customerAppointment: opp.customerAppointment,
				sentQuoteDrafts: opp.quoteDrafts
					.filter((draft): draft is { id: string; sentAt: Date } => draft.sentAt !== null)
					.map(draft => ({ id: draft.id, sentAt: draft.sentAt })),
				latestSentReplyDraftAt,
				priorCheckInCount
			};
		});
	}

	/** Look up the org config the mapper needs (windows + cap). */
	async findOrgCalendarConfig(
		organizationId: string
	): Promise<{ quoteValidityDays: number; followUpCadenceDays: number; followUpMaxCount: number } | null> {
		return this.prisma.organization.findUnique({
			where: { id: organizationId },
			select: { quoteValidityDays: true, followUpCadenceDays: true, followUpMaxCount: true }
		});
	}

	/** Resolve a user (+ their current org) by iCal feed token. Null when the token is unknown. */
	async findUserByIcalToken(token: string): Promise<{ id: string; currentOrganizationId: string | null } | null> {
		return this.prisma.user.findUnique({
			where: { icalFeedToken: token },
			select: { id: true, currentOrganizationId: true }
		});
	}

	/** Set (or rotate, or clear with null) the requesting user's feed token. */
	async setIcalToken(userId: string, token: string | null): Promise<void> {
		await this.prisma.user.update({ where: { id: userId }, data: { icalFeedToken: token } });
	}

	/** Read the current feed token (to render the URL on the settings page). */
	async findIcalToken(userId: string): Promise<string | null> {
		const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { icalFeedToken: true } });
		return user?.icalFeedToken ?? null;
	}
}

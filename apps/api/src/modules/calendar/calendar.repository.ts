// apps/api/src/modules/calendar/calendar.repository.ts
import { MembershipRole, ReplyDraftKind, ReplyDraftStatus } from '@/generated/prisma/enums';
import { ENTITLED_STRIPE_STATUSES } from '@/modules/billing/billing.constants';
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
					// Newest-first; only the current (latest) draft drives the `expiry` marker.
					orderBy: { createdAt: 'desc' },
					take: 1,
					select: { id: true, validUntil: true, createdAt: true }
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
			const current = opp.quoteDrafts[0] ?? null;
			return {
				opportunityId: opp.id,
				status: opp.status,
				dismissedAt: opp.dismissedAt,
				customerName: opp.customerName,
				customerDeadline: opp.customerDeadline,
				customerAppointment: opp.customerAppointment,
				currentQuoteDraft: current
					? { id: current.id, validUntil: current.validUntil, createdAt: current.createdAt }
					: null,
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

	/**
	 * Membership re-verification for the session-less feed path. `User.currentOrganizationId`
	 * alone is not an authorization claim — a user removed from the org can keep a stale
	 * pointer, and their feed token must stop serving that org's data immediately.
	 * EXTERNAL roles are excluded to mirror the in-app calendar's TenantMemberGuard: an
	 * external collaborator must not receive the org's full agenda on their phone, even via
	 * a token minted before their role was set (or while the role-gating didn't exist yet).
	 */
	async isUserMemberOfOrganization(userId: string, organizationId: string): Promise<boolean> {
		const membership = await this.prisma.membership.findFirst({
			where: { userId, organizationId, role: { not: MembershipRole.EXTERNAL } },
			select: { id: true }
		});
		return membership !== null;
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

	/**
	 * Whether the org is currently entitled — the same predicate `EntitlementGuard` uses
	 * (Subscription.status ∈ {trialing, active, past_due}). Used to gate the public iCal feed
	 * so a canceled org's session-less feed stops serving customer data.
	 */
	async isOrganizationEntitled(organizationId: string): Promise<boolean> {
		const sub = await this.prisma.subscription.findUnique({
			where: { organizationId },
			select: { status: true }
		});
		return !!sub?.status && ENTITLED_STRIPE_STATUSES.includes(sub.status);
	}
}

import { Prisma } from '@/generated/prisma/client';
import { EmailProvider, MembershipRole, ReplyDraftStatus as PrismaReplyDraftStatus } from '@/generated/prisma/enums';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

const REPLY_DRAFT_INCLUDE = {
	opportunity: {
		select: {
			id: true,
			organizationId: true,
			customerName: true,
			customerEmail: true,
			address: true,
			requestType: true,
			urgency: true,
			customerDeadline: true,
			customerAppointment: true,
			deliverableHints: true,
			rawMessage: {
				select: {
					subject: true,
					fromName: true,
					fromEmail: true,
					raw: true
				}
			}
		}
	}
} as const satisfies Prisma.ReplyDraftInclude;

/**
 * Shape returned by every read on this repository. Derived from Prisma's generated types
 * so adding a column to the schema flows through without a separate interface update.
 */
export type ReplyDraftRecord = Prisma.ReplyDraftGetPayload<{ include: typeof REPLY_DRAFT_INCLUDE }>;

/**
 * Result returned by the generator-call → persist flow. Shape mirrors the Prisma
 * `Opportunity` fields the generator needs as input.
 */
export interface OpportunityForReplyDraft {
	id: string;
	organizationId: string;
	customerName: string | null;
	address: string | null;
	requestType: string;
	urgency: 'EMERGENCY' | 'HIGH' | 'NORMAL' | 'LOW';
	customerDeadline: Date | null;
	customerAppointment: Date | null;
	deliverableHints: unknown;
	rawMessage: {
		subject: string | null;
		fromName: string | null;
		fromEmail: string | null;
		raw: unknown;
		provider: EmailProvider;
	};
}

@Injectable()
export class ReplyDraftsRepository {
	constructor(private readonly prisma: PrismaService) {}

	/** Fetch everything the AI generator needs to compose a draft for an opportunity. */
	async findOpportunityForGeneration(opportunityId: string): Promise<OpportunityForReplyDraft | null> {
		const opportunity = await this.prisma.opportunity.findUnique({
			where: { id: opportunityId },
			select: {
				id: true,
				organizationId: true,
				customerName: true,
				address: true,
				requestType: true,
				urgency: true,
				customerDeadline: true,
				customerAppointment: true,
				deliverableHints: true,
				rawMessage: {
					select: {
						subject: true,
						fromName: true,
						fromEmail: true,
						raw: true,
						emailAccount: { select: { provider: true } }
					}
				}
			}
		});

		if (!opportunity) {
			return null;
		}

		// Flatten emailAccount.provider up into rawMessage so the service-layer shape stays
		// neatly nested without an extra level. This matches how OpportunitiesRepository
		// surfaces provider on `RawMessageForOpportunityProcessing`.
		return {
			...opportunity,
			rawMessage: {
				subject: opportunity.rawMessage.subject,
				fromName: opportunity.rawMessage.fromName,
				fromEmail: opportunity.rawMessage.fromEmail,
				raw: opportunity.rawMessage.raw,
				provider: opportunity.rawMessage.emailAccount.provider
			}
		};
	}

	/**
	 * Find the org's OWNER user — their `User.tonePlaybookText` is the default voice for
	 * drafts generated for this org (W5.3 "generate-on-arrival with org-default"). The
	 * "regenerate in my voice" affordance (W5.4) uses `findUserForVoice` instead so a
	 * non-OWNER member can swap to their own playbook.
	 */
	async findOwnerForOrganization(
		organizationId: string
	): Promise<{ userId: string; name: string | null; tonePlaybookText: string | null } | null> {
		const ownerMembership = await this.prisma.membership.findFirst({
			where: { organizationId, role: MembershipRole.OWNER },
			select: { user: { select: { id: true, name: true, tonePlaybookText: true } } }
		});

		if (!ownerMembership) {
			return null;
		}

		return {
			userId: ownerMembership.user.id,
			name: ownerMembership.user.name,
			tonePlaybookText: ownerMembership.user.tonePlaybookText
		};
	}

	/**
	 * W5.4 — fetch the requesting user's voice fields. Used by `regenerate()` so the
	 * "Regenereer in mijn stijl" button uses *their* playbook, not the org owner's.
	 */
	async findUserForVoice(
		userId: string
	): Promise<{ userId: string; name: string | null; tonePlaybookText: string | null } | null> {
		const user = await this.prisma.user.findUnique({
			where: { id: userId },
			select: { id: true, name: true, tonePlaybookText: true }
		});

		if (!user) {
			return null;
		}

		return { userId: user.id, name: user.name, tonePlaybookText: user.tonePlaybookText };
	}

	/**
	 * W5.4 — Overwrite the existing draft with a freshly-generated body. Differs from
	 * `createIfAbsent`:
	 *  - Resets `originalBody` to the new generation (the user is choosing a new
	 *    baseline; the W5.7 edit-detection prompt should diff against this).
	 *  - Resets `wasEditedByUser = false` (the new draft hasn't been touched yet).
	 *  - Resets `status = PENDING_APPROVAL`.
	 *  - Refuses to overwrite when `status = SENT` — the email is already out the door
	 *    and there's nothing to "regenerate." Returns null in that case so the caller
	 *    can surface 409.
	 */
	async overwriteAfterRegenerate(input: {
		opportunityId: string;
		body: string;
		aiCallId: string | null;
	}): Promise<{ overwrote: boolean }> {
		const existing = await this.prisma.replyDraft.findUnique({
			where: { opportunityId: input.opportunityId },
			select: { status: true }
		});

		if (!existing) {
			// No draft yet — fall back to create.
			await this.prisma.replyDraft.create({
				data: {
					opportunityId: input.opportunityId,
					originalBody: input.body,
					body: input.body,
					status: PrismaReplyDraftStatus.PENDING_APPROVAL,
					aiCallId: input.aiCallId
				}
			});
			return { overwrote: true };
		}

		if (existing.status === PrismaReplyDraftStatus.SENT) {
			return { overwrote: false };
		}

		await this.prisma.replyDraft.update({
			where: { opportunityId: input.opportunityId },
			data: {
				originalBody: input.body,
				body: input.body,
				wasEditedByUser: false,
				status: PrismaReplyDraftStatus.PENDING_APPROVAL,
				aiCallId: input.aiCallId
			}
		});
		return { overwrote: true };
	}

	async findOrganizationName(organizationId: string): Promise<string | null> {
		const org = await this.prisma.organization.findUnique({
			where: { id: organizationId },
			select: { name: true }
		});
		return org?.name ?? null;
	}

	/**
	 * Persist the freshly-generated draft. `opportunityId` is unique in the schema so
	 * `createMany({ skipDuplicates: true })` makes this idempotent — if the Inngest function
	 * retries after a partial failure, we don't write a second row.
	 */
	async createIfAbsent(input: { opportunityId: string; body: string; aiCallId: string | null }): Promise<boolean> {
		const result = await this.prisma.replyDraft.createMany({
			data: [
				{
					opportunityId: input.opportunityId,
					originalBody: input.body,
					body: input.body,
					status: PrismaReplyDraftStatus.PENDING_APPROVAL,
					aiCallId: input.aiCallId
				}
			],
			skipDuplicates: true
		});

		return result.count > 0;
	}

	async findByOpportunityId(opportunityId: string): Promise<ReplyDraftRecord | null> {
		return this.prisma.replyDraft.findUnique({
			where: { opportunityId },
			include: REPLY_DRAFT_INCLUDE
		});
	}
}

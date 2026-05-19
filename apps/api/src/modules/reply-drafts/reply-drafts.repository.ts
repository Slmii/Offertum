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
	rawMessage: RawMessageForReplyDraft;
}

export interface RawMessageForReplyDraft {
	subject: string | null;
	fromName: string | null;
	fromEmail: string | null;
	raw: unknown;
	provider: EmailProvider;
}

/**
 * Voice fields used by both `findOwnerForOrganization` (org-OWNER default for W5.3
 * generate-on-arrival) and `findUserForVoice` (requesting user for W5.4 regenerate-
 * in-my-style). One interface, two retrieval paths.
 */
export interface UserVoice {
	userId: string;
	name: string | null;
	tonePlaybookText: string | null;
}

/** Input for `createIfAbsent` — initial reply-draft insert keyed by `opportunityId`. */
export interface CreateReplyDraftInput {
	opportunityId: string;
	body: string;
	aiCallId: string | null;
}

/** Input for `overwriteAfterRegenerate` — same shape as the create path. */
export interface OverwriteAfterRegenerateInput {
	opportunityId: string;
	body: string;
	aiCallId: string | null;
}

/** Result of `overwriteAfterRegenerate` — `false` when refusing to overwrite a SENT draft. */
export interface OverwriteAfterRegenerateResult {
	overwrote: boolean;
}

/** Result of `markSent` — surfaces the persisted `sentAt` so the caller can echo it. */
export interface MarkSentResult {
	draftSentAt: Date;
}

/**
 * Everything `ReplyDraftsService.send` needs in one round-trip. Composed of tightly-
 * coupled sub-rows so the consumer can read each axis (draft / opportunity / mailbox /
 * customer / attachments) without re-fetching.
 */
export interface SendContext {
	draftId: string;
	body: string;
	status: PrismaReplyDraftStatus;
	opportunity: SendContextOpportunity;
	emailAccount: SendContextEmailAccount;
	rawMessage: SendContextRawMessage;
	attachments: SendContextAttachment[];
}

export interface SendContextOpportunity {
	id: string;
	organizationId: string;
	status: string;
}

export interface SendContextEmailAccount {
	id: string;
	provider: EmailProvider;
	email: string;
	inboxOwnerUserId: string | null;
	inboxOwnerName: string | null;
}

export interface SendContextRawMessage {
	subject: string | null;
	fromEmail: string | null;
	fromName: string | null;
	raw: unknown;
	threadId: string | null;
}

/**
 * W5.5 follow-up — attachment metadata the send path needs. Binary bytes live in the
 * storage backend; the service loads them via `AttachmentStorage.get(storageKey)`
 * just before composing the provider envelope.
 */
export interface SendContextAttachment {
	id: string;
	filename: string;
	contentType: string;
	sizeBytes: number;
	storageKey: string;
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
	async findOwnerForOrganization(organizationId: string): Promise<UserVoice | null> {
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
	async findUserForVoice(userId: string): Promise<UserVoice | null> {
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
	async overwriteAfterRegenerate(input: OverwriteAfterRegenerateInput): Promise<OverwriteAfterRegenerateResult> {
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
	async createIfAbsent(input: CreateReplyDraftInput): Promise<boolean> {
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

	/**
	 * W5.5 — Fetch everything the send orchestrator needs in one round-trip: the draft,
	 * the opportunity (for status + organizationId), the email account (for OAuth scope
	 * routing + From-address), the inbox owner's display name, the customer's contact
	 * + threading headers from the original RawMessage.
	 */
	async findSendContext(opportunityId: string): Promise<SendContext | null> {
		const draft = await this.prisma.replyDraft.findUnique({
			where: { opportunityId },
			select: {
				id: true,
				body: true,
				status: true,
				opportunity: {
					select: {
						id: true,
						organizationId: true,
						status: true,
						emailAccount: {
							select: {
								id: true,
								provider: true,
								email: true,
								userId: true,
								user: { select: { name: true } }
							}
						},
						rawMessage: {
							select: {
								subject: true,
								fromEmail: true,
								fromName: true,
								raw: true,
								threadId: true
							}
						}
					}
				},
				attachments: {
					orderBy: { createdAt: 'asc' },
					select: {
						id: true,
						filename: true,
						contentType: true,
						sizeBytes: true,
						storageKey: true
					}
				}
			}
		});

		if (!draft) {
			return null;
		}

		return {
			draftId: draft.id,
			body: draft.body,
			status: draft.status,
			opportunity: {
				id: draft.opportunity.id,
				organizationId: draft.opportunity.organizationId,
				status: draft.opportunity.status
			},
			emailAccount: {
				id: draft.opportunity.emailAccount.id,
				provider: draft.opportunity.emailAccount.provider,
				email: draft.opportunity.emailAccount.email,
				inboxOwnerUserId: draft.opportunity.emailAccount.userId,
				inboxOwnerName: draft.opportunity.emailAccount.user?.name ?? null
			},
			rawMessage: {
				subject: draft.opportunity.rawMessage.subject,
				fromEmail: draft.opportunity.rawMessage.fromEmail,
				fromName: draft.opportunity.rawMessage.fromName,
				raw: draft.opportunity.rawMessage.raw,
				threadId: draft.opportunity.rawMessage.threadId
			},
			attachments: draft.attachments.map(a => ({
				id: a.id,
				filename: a.filename,
				contentType: a.contentType,
				sizeBytes: a.sizeBytes,
				storageKey: a.storageKey
			}))
		};
	}

	/**
	 * W5.5 — Mark the draft as `SENT` + the opportunity as `REPLIED` in one transaction.
	 * Wraps both because the customer-visible-effect (the email actually went out) is
	 * already irrevocable when this runs — leaving the DB half-updated would create the
	 * worst kind of split-brain (status says "still drafting" but the customer has the
	 * email). Either both transitions persist or neither does.
	 */
	async markSent(input: { opportunityId: string }): Promise<MarkSentResult> {
		const now = new Date();
		await this.prisma.$transaction([
			this.prisma.replyDraft.update({
				where: { opportunityId: input.opportunityId },
				data: { status: PrismaReplyDraftStatus.SENT, sentAt: now }
			}),
			this.prisma.opportunity.update({
				where: { id: input.opportunityId },
				data: { status: 'REPLIED' }
			})
		]);
		return { draftSentAt: now };
	}
}

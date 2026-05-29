import type { ReplyDraftStatus as PrismaReplyDraftStatus } from '@/generated/prisma/enums';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

/**
 * Row shape returned by every read on this repository. `storageDriver` is the literal
 * captured at write-time — we don't narrow it to a union here because the runtime values
 * are governed by the `AttachmentStorage.driver` field; widening to `string` keeps the
 * row decoupled from the driver enum so adding a new driver doesn't require a parallel
 * migration on this type.
 */
export interface ReplyDraftAttachmentRow {
	id: string;
	replyDraftId: string;
	filename: string;
	contentType: string;
	sizeBytes: number;
	storageKey: string;
	storageDriver: string;
	quotePdfId: string | null;
	createdAt: Date;
}

export interface CreateAttachmentInput {
	replyDraftId: string;
	filename: string;
	contentType: string;
	sizeBytes: number;
	storageKey: string;
	storageDriver: string;
	/** Set when the attachment is a copy of a generated quote PDF version. */
	quotePdfId?: string | null;
}

/**
 * Lookup shape used by `OpportunitiesController` before authorizing attachment writes.
 * Surfaces the parent draft's `opportunityId` + the draft's send state so the service
 * layer can refuse mutations on a SENT draft without re-querying.
 */
export interface AttachmentForAuthorization {
	id: string;
	storageKey: string;
	storageDriver: string;
	contentType: string;
	filename: string;
	replyDraftId: string;
	opportunityId: string;
	organizationId: string;
	draftStatus: PrismaReplyDraftStatus;
}

/**
 * Shape returned by `findDraftForUpload`. The editability gate keys off `status` alone
 * ( dropped the opp-status leg).
 */
export interface DraftForUpload {
	draftId: string;
	opportunityId: string;
	status: PrismaReplyDraftStatus;
	attachmentCount: number;
	attachmentTotalBytes: number;
}

@Injectable()
export class ReplyDraftAttachmentsRepository {
	constructor(private readonly prisma: PrismaService) {}

	/**
	 * Find the draft + its parent opportunity, scoped to the org. Returns `null` when the
	 * draft doesn't exist OR the opportunity belongs to a different organization (no row
	 * leakage across tenants).
	 */
	async findDraftForUpload(organizationId: string, opportunityId: string): Promise<DraftForUpload | null> {
		// Pick the LATEST draft for the opp (was: unique-by-opportunityId).
		// The editability gate in the service layer refuses uploads when the latest is
		// SENT, so we don't filter by status here — keeps the error message coherent
		// ("draft is closed" rather than "no draft found").
		const draft = await this.prisma.replyDraft.findFirst({
			where: { opportunityId, opportunity: { organizationId } },
			orderBy: { createdAt: 'desc' },
			select: {
				id: true,
				opportunityId: true,
				status: true,
				attachments: { select: { sizeBytes: true } }
			}
		});
		if (!draft) {
			return null;
		}
		const total = draft.attachments.reduce((sum, a) => sum + a.sizeBytes, 0);
		return {
			draftId: draft.id,
			opportunityId: draft.opportunityId,
			status: draft.status,
			attachmentCount: draft.attachments.length,
			attachmentTotalBytes: total
		};
	}

	async listForDraft(replyDraftId: string): Promise<ReplyDraftAttachmentRow[]> {
		return this.prisma.replyDraftAttachment.findMany({
			where: { replyDraftId },
			orderBy: { createdAt: 'asc' }
		});
	}

	async create(input: CreateAttachmentInput): Promise<ReplyDraftAttachmentRow> {
		return this.prisma.replyDraftAttachment.create({
			data: {
				replyDraftId: input.replyDraftId,
				filename: input.filename,
				contentType: input.contentType,
				sizeBytes: input.sizeBytes,
				storageKey: input.storageKey,
				storageDriver: input.storageDriver,
				quotePdfId: input.quotePdfId ?? null
			}
		});
	}

	/** The draft's currently-attached quote-PDF copy (if any) — used to replace it so at
	 * most one quote PDF is attached at a time. */
	async findQuotePdfAttachment(replyDraftId: string): Promise<ReplyDraftAttachmentRow | null> {
		return this.prisma.replyDraftAttachment.findFirst({
			where: { replyDraftId, quotePdfId: { not: null } }
		});
	}

	/**
	 * Find an attachment + the parent draft's state for tenant-scoped authorization. The
	 * controller calls this BEFORE accepting a delete or download, then hands off to the
	 * service. Bundling everything into one round-trip avoids the classic check-then-act
	 * race.
	 */
	async findForAuthorization(
		organizationId: string,
		opportunityId: string,
		attachmentId: string
	): Promise<AttachmentForAuthorization | null> {
		const row = await this.prisma.replyDraftAttachment.findFirst({
			where: {
				id: attachmentId,
				replyDraft: {
					opportunityId,
					opportunity: { organizationId }
				}
			},
			select: {
				id: true,
				storageKey: true,
				storageDriver: true,
				contentType: true,
				filename: true,
				replyDraftId: true,
				replyDraft: {
					select: {
						opportunityId: true,
						status: true,
						opportunity: { select: { organizationId: true } }
					}
				}
			}
		});
		if (!row) {
			return null;
		}
		return {
			id: row.id,
			storageKey: row.storageKey,
			storageDriver: row.storageDriver,
			contentType: row.contentType,
			filename: row.filename,
			replyDraftId: row.replyDraftId,
			opportunityId: row.replyDraft.opportunityId,
			organizationId: row.replyDraft.opportunity.organizationId,
			draftStatus: row.replyDraft.status
		};
	}

	async deleteById(attachmentId: string): Promise<void> {
		await this.prisma.replyDraftAttachment.delete({ where: { id: attachmentId } });
	}
}

import {
	ATTACHMENT_ALLOWED_MIME_TYPES,
	ATTACHMENT_MAX_FILE_BYTES,
	ATTACHMENT_MAX_PER_DRAFT,
	ATTACHMENT_MAX_TOTAL_BYTES
} from '@/lib/storage/attachment-constraints';
import { ATTACHMENT_STORAGE, type AttachmentStorage } from '@/lib/storage/attachment-storage.interface';
import {
	ATTACHMENT_FILE_MISSING,
	ATTACHMENT_NOT_FOUND,
	OPPORTUNITY_NOT_FOUND,
	REPLY_DRAFT_LOCKED,
	attachmentCountExceeded,
	attachmentFileTooLarge,
	attachmentMimeNotAllowed,
	attachmentTotalTooLarge
} from '@/lib/errors';
import { LogService } from '@/modules/logger/log.service';
import {
	ReplyDraftAttachmentsRepository,
	type ReplyDraftAttachmentRow
} from '@/modules/reply-draft-attachments/reply-draft-attachments.repository';
import { isReplyDraftEditable } from '@/modules/opportunities/reply-draft-editability';
import {
	BadRequestException,
	ConflictException,
	Inject,
	Injectable,
	NotFoundException,
	PayloadTooLargeException,
	UnsupportedMediaTypeException
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

/**
 * Minimal multer-file shape we depend on. Declared locally so we don't have to add
 * `@types/multer` as a devDependency — multer itself is bundled by
 * `@nestjs/platform-express`, only the types package is separate.
 */
export interface UploadedFileLike {
	originalname: string;
	mimetype: string;
	size: number;
	buffer: Buffer;
}

export interface UploadAttachmentResult {
	attachment: ReplyDraftAttachmentRow;
}

export interface DownloadAttachmentResult {
	filename: string;
	contentType: string;
	data: Buffer;
}

/**
 * W5.5 follow-up — orchestrates upload, list, delete, download for reply-draft
 * attachments. Pure orchestration — guards (limits + MIME + draft-locked) live here,
 * binary I/O lives in `AttachmentStorage`, Postgres I/O lives in the repository.
 *
 * The send path doesn't go through here: `ReplyDraftsService.send` reads attachments
 * directly via its own repository for one round-trip, then loads each blob via the
 * same `AttachmentStorage` injected here. Separation keeps the upload surface from
 * being a hot-path dependency of the send surface.
 */
@Injectable()
export class ReplyDraftAttachmentsService {
	constructor(
		private readonly repository: ReplyDraftAttachmentsRepository,
		@Inject(ATTACHMENT_STORAGE) private readonly storage: AttachmentStorage,
		private readonly logService: LogService
	) {}

	async list(organizationId: string, opportunityId: string): Promise<ReplyDraftAttachmentRow[]> {
		const draft = await this.repository.findDraftForUpload(organizationId, opportunityId);
		if (!draft) {
			// Either the opportunity isn't in this org, or the draft hasn't been generated yet.
			// Both surface as 404 from the consumer's perspective.
			throw new NotFoundException(OPPORTUNITY_NOT_FOUND);
		}
		return this.repository.listForDraft(draft.draftId);
	}

	async upload(
		organizationId: string,
		opportunityId: string,
		file: UploadedFileLike | undefined
	): Promise<UploadAttachmentResult> {
		if (!file) {
			throw new BadRequestException(ATTACHMENT_FILE_MISSING);
		}

		const draft = await this.repository.findDraftForUpload(organizationId, opportunityId);
		if (!draft) {
			throw new NotFoundException(OPPORTUNITY_NOT_FOUND);
		}

		if (!isReplyDraftEditable({ opportunityStatus: draft.opportunityStatus, draftStatus: draft.status })) {
			throw new ConflictException(REPLY_DRAFT_LOCKED);
		}

		// Validation order is intentional: cheap checks first (count + size + MIME) so a
		// malformed upload never reaches the storage backend.
		if (draft.attachmentCount >= ATTACHMENT_MAX_PER_DRAFT) {
			throw new BadRequestException(attachmentCountExceeded(ATTACHMENT_MAX_PER_DRAFT));
		}
		if (file.size > ATTACHMENT_MAX_FILE_BYTES) {
			throw new PayloadTooLargeException(attachmentFileTooLarge(file.size, ATTACHMENT_MAX_FILE_BYTES));
		}
		const projectedTotal = draft.attachmentTotalBytes + file.size;
		if (projectedTotal > ATTACHMENT_MAX_TOTAL_BYTES) {
			throw new PayloadTooLargeException(attachmentTotalTooLarge(projectedTotal, ATTACHMENT_MAX_TOTAL_BYTES));
		}
		if (!ATTACHMENT_ALLOWED_MIME_TYPES.has(file.mimetype)) {
			throw new UnsupportedMediaTypeException(attachmentMimeNotAllowed(file.mimetype));
		}

		const sanitizedFilename = sanitizeFilename(file.originalname);
		const storageKey = `${draft.draftId}/${randomUUID()}-${sanitizedFilename}`;

		await this.storage.put({ storageKey, data: file.buffer, contentType: file.mimetype });

		const row = await this.repository.create({
			replyDraftId: draft.draftId,
			filename: sanitizedFilename,
			contentType: file.mimetype,
			sizeBytes: file.size,
			storageKey,
			storageDriver: this.storage.driver
		});

		this.logService.logAction({
			action: 'reply_draft.attachment.uploaded',
			message: `Attachment ${sanitizedFilename} (${file.size} bytes) attached to draft ${draft.draftId}`,
			metadata: {
				organizationId,
				opportunityId,
				replyDraftId: draft.draftId,
				attachmentId: row.id,
				filename: sanitizedFilename,
				contentType: file.mimetype,
				sizeBytes: file.size,
				driver: this.storage.driver
			},
			context: 'ReplyDraftAttachmentsService'
		});

		return { attachment: row };
	}

	async delete(organizationId: string, opportunityId: string, attachmentId: string): Promise<void> {
		const row = await this.repository.findForAuthorization(organizationId, opportunityId, attachmentId);
		if (!row) {
			throw new NotFoundException(ATTACHMENT_NOT_FOUND);
		}
		if (!isReplyDraftEditable({ opportunityStatus: row.opportunityStatus, draftStatus: row.draftStatus })) {
			throw new ConflictException(REPLY_DRAFT_LOCKED);
		}

		// DB row first, then blob — if blob delete fails we'd rather have an orphaned
		// blob (harmless on local FS, cleanable on Spaces with a sweeper) than an orphaned
		// DB row pointing at a missing blob (which would 500 on every download attempt).
		await this.repository.deleteById(attachmentId);
		await this.storage.delete(row.storageKey).catch(error => {
			this.logService.logAction({
				action: 'reply_draft.attachment.delete_blob_failed',
				message: `Deleted DB row ${attachmentId} but storage delete failed: ${error instanceof Error ? error.message : 'unknown'}`,
				metadata: { organizationId, opportunityId, attachmentId, storageKey: row.storageKey },
				level: 'warn',
				stack: error instanceof Error ? error.stack : undefined,
				context: 'ReplyDraftAttachmentsService'
			});
		});

		this.logService.logAction({
			action: 'reply_draft.attachment.deleted',
			message: `Attachment ${row.filename} removed from draft ${row.replyDraftId}`,
			metadata: { organizationId, opportunityId, attachmentId, filename: row.filename },
			context: 'ReplyDraftAttachmentsService'
		});
	}

	async download(
		organizationId: string,
		opportunityId: string,
		attachmentId: string
	): Promise<DownloadAttachmentResult> {
		const row = await this.repository.findForAuthorization(organizationId, opportunityId, attachmentId);
		if (!row) {
			throw new NotFoundException(ATTACHMENT_NOT_FOUND);
		}
		const { data, contentType } = await this.storage.get(row.storageKey);
		// Prefer the stored contentType from the DB row over the storage backend's reading
		// — for Spaces the round-trip is server-set, for local FS we read a sidecar that
		// could in theory drift. The DB row is canonical.
		return { filename: row.filename, contentType: row.contentType || contentType, data };
	}
}

/**
 * Strip path separators + collapse whitespace + cap length. Filename appears in the
 * Content-Disposition header on send and in the UI as a chip label — keep it simple
 * and safe. Never trust the client-supplied original.
 */
function sanitizeFilename(raw: string): string {
	const noPath = raw.replace(/[/\\]/g, '_').trim();
	const collapsed = noPath.replace(/\s+/g, ' ');
	const capped = collapsed.length > 120 ? collapsed.slice(0, 120) : collapsed;
	return capped || 'attachment';
}

import type { ReplyDraftAttachment } from '@quoteom/shared';

/**
 * W5.5 follow-up — response DTO mirroring `ReplyDraftAttachment` from `@quoteom/shared`.
 * Concrete class (not interface) per the controller-DTO convention so the OpenAPI spec
 * + Orval-generated web types carry the shape at runtime.
 */
export class ReplyDraftAttachmentResponseDto implements ReplyDraftAttachment {
	id!: string;
	replyDraftId!: string;
	filename!: string;
	contentType!: string;
	sizeBytes!: number;
	createdAt!: string;
}

import type {
	CustomerReplyEntry,
	OpportunityDetail,
	OpportunityTimelineEvent,
	ReplyDraft,
	ReplyDraftKind,
	ReplyDraftStatus,
	ThreadMessageDirection
} from '@quoteom/shared';
import { OpportunityResponseDto } from '@/modules/opportunities/dto/opportunity.response.dto';
import type { ReplyDraftAttachmentResponseDto } from '@/modules/reply-draft-attachments/dto/reply-draft-attachment.response.dto';

export class CustomerReplyEntryResponseDto implements CustomerReplyEntry {
	id!: string;
	fromName!: string | null;
	fromEmail!: string | null;
	receivedAt!: string;
	body!: string;
	direction!: ThreadMessageDirection;
	wasDetectedAsCloser!: boolean;
}

/**
 * `GET /api/opportunities/:id` response. Concrete classes so the OpenAPI spec
 * (and Orval-generated web types) carry the shape at runtime.
 */
export class ReplyDraftResponseDto implements ReplyDraft {
	id!: string;
	opportunityId!: string;
	originalBody!: string;
	body!: string;
	status!: ReplyDraftStatus;
	kind!: ReplyDraftKind;
	wasEditedByUser!: boolean;
	aiCallId!: string | null;
	sentAt!: string | null;
	createdAt!: string;
	updatedAt!: string;
	aiBodyGeneratedAt!: string | null;
	attachments!: ReplyDraftAttachmentResponseDto[];
}

export class OpportunityDetailResponseDto extends OpportunityResponseDto implements OpportunityDetail {
	originalEmailBody!: string;
	replyDraft!: ReplyDraftResponseDto | null;
	replyDraftHistory!: ReplyDraftResponseDto[];
	customerReplies!: CustomerReplyEntryResponseDto[];
	timeline!: OpportunityTimelineEvent[];
}

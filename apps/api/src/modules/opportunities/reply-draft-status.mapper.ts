import { ReplyDraftStatus as PrismaReplyDraftStatus } from '@/generated/prisma/enums';
import type { ReplyDraftStatus as WireReplyDraftStatus } from '@quoteom/shared';

export const REPLY_DRAFT_STATUS_TO_WIRE: Record<PrismaReplyDraftStatus, WireReplyDraftStatus> = {
	[PrismaReplyDraftStatus.PENDING_APPROVAL]: 'pending_approval',
	[PrismaReplyDraftStatus.EDITED]: 'edited',
	[PrismaReplyDraftStatus.SENT]: 'sent'
};

import { InboundAttachmentStatus as PrismaInboundAttachmentStatus } from '@/generated/prisma/enums';
import type { InboundAttachmentStatus as WireInboundAttachmentStatus } from '@offertum/shared';

export const INBOUND_ATTACHMENT_STATUS_TO_WIRE: Record<
	PrismaInboundAttachmentStatus,
	WireInboundAttachmentStatus
> = {
	[PrismaInboundAttachmentStatus.PENDING]: 'pending',
	[PrismaInboundAttachmentStatus.PARSED]: 'parsed',
	[PrismaInboundAttachmentStatus.EMPTY]: 'empty',
	[PrismaInboundAttachmentStatus.UNSUPPORTED]: 'unsupported',
	[PrismaInboundAttachmentStatus.TOO_LARGE]: 'too_large',
	[PrismaInboundAttachmentStatus.ENCRYPTED]: 'encrypted',
	[PrismaInboundAttachmentStatus.FAILED]: 'failed'
};

import { QuoteDraftStatus as PrismaQuoteDraftStatus } from '@/generated/prisma/enums';
import type { QuoteDraftStatus as WireQuoteDraftStatus } from '@offertum/shared';

export const QUOTE_DRAFT_STATUS_TO_WIRE: Record<PrismaQuoteDraftStatus, WireQuoteDraftStatus> = {
	[PrismaQuoteDraftStatus.DRAFT]: 'draft',
	[PrismaQuoteDraftStatus.SENT]: 'sent'
};

import { Urgency as PrismaUrgency } from '@/generated/prisma/enums';
import type { OpportunityUrgency } from '@quoteom/shared';

export const OPPORTUNITY_URGENCY_TO_WIRE: Record<PrismaUrgency, OpportunityUrgency> = {
	[PrismaUrgency.EMERGENCY]: 'emergency',
	[PrismaUrgency.HIGH]: 'high',
	[PrismaUrgency.NORMAL]: 'normal',
	[PrismaUrgency.LOW]: 'low'
};

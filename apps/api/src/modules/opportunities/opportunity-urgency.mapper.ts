import { Urgency as PrismaUrgency } from '@/generated/prisma/enums';
import type { OpportunityUrgency } from '@offertum/shared';

export const OPPORTUNITY_URGENCY_TO_WIRE: Record<PrismaUrgency, OpportunityUrgency> = {
	[PrismaUrgency.EMERGENCY]: 'emergency',
	[PrismaUrgency.HIGH]: 'high',
	[PrismaUrgency.NORMAL]: 'normal',
	[PrismaUrgency.LOW]: 'low'
};

export const OPPORTUNITY_URGENCY_FROM_WIRE: Record<OpportunityUrgency, PrismaUrgency> = {
	emergency: PrismaUrgency.EMERGENCY,
	high: PrismaUrgency.HIGH,
	normal: PrismaUrgency.NORMAL,
	low: PrismaUrgency.LOW
};

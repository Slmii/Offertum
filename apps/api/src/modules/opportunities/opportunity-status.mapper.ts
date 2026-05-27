import { OpportunityStatus as PrismaOpportunityStatus } from '@/generated/prisma/enums';
import type { OpportunityStatus as WireOpportunityStatus } from '@offertum/shared';

export const OPPORTUNITY_STATUS_TO_WIRE: Record<PrismaOpportunityStatus, WireOpportunityStatus> = {
	[PrismaOpportunityStatus.NEW]: 'new',
	[PrismaOpportunityStatus.REPLIED]: 'replied',
	[PrismaOpportunityStatus.WAITING]: 'waiting',
	[PrismaOpportunityStatus.COLD]: 'cold',
	[PrismaOpportunityStatus.WON]: 'won',
	[PrismaOpportunityStatus.LOST]: 'lost'
};

export const OPPORTUNITY_STATUS_FROM_WIRE: Record<WireOpportunityStatus, PrismaOpportunityStatus> = {
	new: PrismaOpportunityStatus.NEW,
	replied: PrismaOpportunityStatus.REPLIED,
	waiting: PrismaOpportunityStatus.WAITING,
	cold: PrismaOpportunityStatus.COLD,
	won: PrismaOpportunityStatus.WON,
	lost: PrismaOpportunityStatus.LOST
};

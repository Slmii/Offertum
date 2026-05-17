import { OpportunityStatus as PrismaOpportunityStatus } from '@/generated/prisma/enums';
import type { OpportunityStatus as WireOpportunityStatus } from '@quoteom/shared';

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

const ALLOWED_TRANSITIONS: Record<PrismaOpportunityStatus, readonly PrismaOpportunityStatus[]> = {
	[PrismaOpportunityStatus.NEW]: [
		PrismaOpportunityStatus.REPLIED,
		PrismaOpportunityStatus.COLD,
		PrismaOpportunityStatus.WON,
		PrismaOpportunityStatus.LOST
	],
	[PrismaOpportunityStatus.REPLIED]: [
		PrismaOpportunityStatus.WAITING,
		PrismaOpportunityStatus.COLD,
		PrismaOpportunityStatus.WON,
		PrismaOpportunityStatus.LOST
	],
	[PrismaOpportunityStatus.WAITING]: [
		PrismaOpportunityStatus.REPLIED,
		PrismaOpportunityStatus.COLD,
		PrismaOpportunityStatus.WON,
		PrismaOpportunityStatus.LOST
	],
	[PrismaOpportunityStatus.COLD]: [
		PrismaOpportunityStatus.WAITING,
		PrismaOpportunityStatus.WON,
		PrismaOpportunityStatus.LOST
	],
	[PrismaOpportunityStatus.WON]: [],
	[PrismaOpportunityStatus.LOST]: []
};

export function isOpportunityStatusTransitionAllowed(
	current: PrismaOpportunityStatus,
	next: PrismaOpportunityStatus
): boolean {
	return current === next || ALLOWED_TRANSITIONS[current].includes(next);
}

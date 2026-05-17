import { Urgency as PrismaUrgency } from '@/generated/prisma/enums';
import { OPPORTUNITY_URGENCY_TO_WIRE } from '@/modules/opportunities/opportunity-urgency.mapper';
import { describe, expect, it } from '@jest/globals';

describe('OPPORTUNITY_URGENCY_TO_WIRE', () => {
	it('maps each Prisma enum value to the matching lowercase wire string', () => {
		expect(OPPORTUNITY_URGENCY_TO_WIRE[PrismaUrgency.EMERGENCY]).toBe('emergency');
		expect(OPPORTUNITY_URGENCY_TO_WIRE[PrismaUrgency.HIGH]).toBe('high');
		expect(OPPORTUNITY_URGENCY_TO_WIRE[PrismaUrgency.NORMAL]).toBe('normal');
		expect(OPPORTUNITY_URGENCY_TO_WIRE[PrismaUrgency.LOW]).toBe('low');
	});

	it('covers every Prisma Urgency value (catches schema drift)', () => {
		const prismaKeys = Object.keys(PrismaUrgency);
		const mapperKeys = Object.keys(OPPORTUNITY_URGENCY_TO_WIRE);
		expect(mapperKeys.sort()).toEqual(prismaKeys.sort());
	});
});

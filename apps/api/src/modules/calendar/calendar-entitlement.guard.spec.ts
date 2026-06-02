import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { HttpException, HttpStatus, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { CalendarEntitlementGuard } from './calendar-entitlement.guard';
import type { CalendarRepository } from './calendar.repository';

function makeContext(request: Partial<Request>): ExecutionContext {
	return {
		switchToHttp: () => ({ getRequest: () => request })
	} as unknown as ExecutionContext;
}

describe('CalendarEntitlementGuard', () => {
	let isOrganizationEntitled: jest.MockedFunction<CalendarRepository['isOrganizationEntitled']>;
	let guard: CalendarEntitlementGuard;

	beforeEach(() => {
		isOrganizationEntitled = jest.fn<CalendarRepository['isOrganizationEntitled']>();
		guard = new CalendarEntitlementGuard({ isOrganizationEntitled } as unknown as CalendarRepository);
	});

	it('allows the request when the org is entitled', async () => {
		isOrganizationEntitled.mockResolvedValue(true);
		await expect(guard.canActivate(makeContext({ organizationId: 'org-1' }))).resolves.toBe(true);
		expect(isOrganizationEntitled).toHaveBeenCalledWith('org-1');
	});

	it('throws 402 billing_required when the org is not entitled', async () => {
		isOrganizationEntitled.mockResolvedValue(false);
		await expect(guard.canActivate(makeContext({ organizationId: 'org-1' }))).rejects.toMatchObject({
			status: HttpStatus.PAYMENT_REQUIRED
		});
		await expect(guard.canActivate(makeContext({ organizationId: 'org-1' }))).rejects.toBeInstanceOf(HttpException);
	});

	it('throws 402 when no organization context is present (fail closed)', async () => {
		await expect(guard.canActivate(makeContext({}))).rejects.toMatchObject({
			status: HttpStatus.PAYMENT_REQUIRED
		});
		expect(isOrganizationEntitled).not.toHaveBeenCalled();
	});
});

import { MISSING_ORG_CONTEXT, SUBSCRIPTION_REQUIRED } from '@/lib/errors';
import { BILLING_REQUIRED_CODE } from '@/modules/billing/billing.constants';
import { CalendarRepository } from '@/modules/calendar/calendar.repository';
import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Gates the iCal-sync (feed-token) endpoints behind subscription entitlement, for ALL methods
 * including the GET read — so a customer can neither create/rotate nor even look up their phone-
 * sync URL without an active subscription. The in-app calendar READ is deliberately NOT gated by
 * this guard (it stays open to any org member, like every other read in the app); only the
 * token endpoints opt in via method-level `@UseGuards(CalendarEntitlementGuard)`. The public iCal
 * feed is gated separately inside `CalendarService.renderFeed` (it has no session to 402), so an
 * existing phone subscription also goes dark the moment a subscription is cancelled.
 *
 * This differs from the app-wide `EntitlementGuard`, which lets reads (GET) through — here the
 * GET feed-token read is gated too, because looking up the sync URL is itself a sync action.
 *
 * Entitled = `Subscription.status ∈ {trialing, active, past_due}` (the same predicate as
 * `EntitlementGuard`, reused via `CalendarRepository.isOrganizationEntitled`). Must run AFTER
 * `OrganizationGuard` so `request.organizationId` is populated. The 402 body mirrors
 * `EntitlementGuard`'s shape so the web `client.ts` surfaces the billing banner.
 */
@Injectable()
export class CalendarEntitlementGuard implements CanActivate {
	constructor(private readonly calendar: CalendarRepository) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest<Request>();
		const organizationId = request.organizationId;
		if (!organizationId) {
			throw this.billingRequired(MISSING_ORG_CONTEXT);
		}
		if (await this.calendar.isOrganizationEntitled(organizationId)) {
			return true;
		}
		throw this.billingRequired(SUBSCRIPTION_REQUIRED);
	}

	private billingRequired(message: string): HttpException {
		return new HttpException(
			{
				statusCode: HttpStatus.PAYMENT_REQUIRED,
				code: BILLING_REQUIRED_CODE,
				message,
				billingPath: '/billing'
			},
			HttpStatus.PAYMENT_REQUIRED
		);
	}
}

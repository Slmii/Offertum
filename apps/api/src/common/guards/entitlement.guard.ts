import { MISSING_ORG_CONTEXT, SUBSCRIPTION_REQUIRED } from '@/lib/errors';
import { BILLING_REQUIRED_CODE, ENTITLED_STRIPE_STATUSES, READ_METHODS } from '@/modules/billing/billing.constants';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Gates write routes (POST/PATCH/PUT/DELETE) behind subscription entitlement. Despite the
 * name, this is NOT only for trials — it's the general "is this org allowed to make
 * changes right now" check, covering trial, paying, past-due, canceled, etc.
 *
 * Must run AFTER OrganizationGuard so that `request.organizationId` is populated.
 * Compose via the `@TenantWrite()` / `@OwnerWrite()` decorators (recommended) or with
 * `@UseGuards(OrganizationGuard, EntitlementGuard)` directly.
 *
 * Entitled path: Subscription.status ∈ {trialing, active, past_due}. Stripe is the only
 * source of trial entitlement — a brand-new org with no Subscription row at all gets a
 * 402 on writes and must Checkout (which captures a card and starts Stripe's 14-day trial)
 * before it can do anything.
 *
 * Everything else (no sub, canceled, unpaid, incomplete_expired, paused, incomplete) →
 * 402 with `{ code: 'billing_required' }`.
 */
@Injectable()
export class EntitlementGuard implements CanActivate {
	constructor(private readonly prisma: PrismaService) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest<Request>();

		if (READ_METHODS.includes(request.method)) {
			return true;
		}

		const organizationId = request.organizationId;
		if (!organizationId) {
			// OrganizationGuard didn't run or failed silently — fail closed by throwing
			// the standard 402 rather than silently passing. This should never happen
			// in normal flow but defensive coding here is cheap.
			throw this.billingRequired(MISSING_ORG_CONTEXT);
		}

		const sub = await this.prisma.subscription.findUnique({
			where: { organizationId },
			select: { status: true }
		});

		if (sub?.status && ENTITLED_STRIPE_STATUSES.includes(sub.status)) {
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

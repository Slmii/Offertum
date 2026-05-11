import { OrganizationGuard } from '@/modules/auth/organization.guard';
import { TrialGateGuard } from '@/modules/billing/trial-gate.guard';
import { applyDecorators, UseGuards } from '@nestjs/common';

/**
 * Composite decorator for tenant-scoped write endpoints. Applies:
 *  1. OrganizationGuard — authenticates + attaches `request.organizationId`.
 *  2. TrialGateGuard — returns 402 if the org's trial has ended without a payment method.
 *
 * Use on every controller method that mutates tenant data. For reads, prefer
 * `@UseGuards(OrganizationGuard)` alone (TrialGateGuard would no-op on GET anyway, but
 * keeping reads off the trial code path avoids surprising future changes).
 */
export function TenantWrite(): ClassDecorator & MethodDecorator {
	return applyDecorators(UseGuards(OrganizationGuard, TrialGateGuard));
}

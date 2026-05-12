import { EntitlementGuard } from '@/common/guards/entitlement.guard';
import { OrganizationGuard } from '@/common/guards/organization.guard';
import { applyDecorators, UseGuards } from '@nestjs/common';

/**
 * Composite decorator for tenant-scoped write endpoints. Applies:
 *  1. OrganizationGuard — authenticates + attaches `request.organizationId`.
 *  2. EntitlementGuard — returns 402 if the org has no active subscription / trial /
 *     past-due grace. Covers trial expiry, cancellation, unpaid, and similar states.
 *
 * Use on every controller method that mutates tenant data. For reads, prefer
 * `@UseGuards(OrganizationGuard)` alone (EntitlementGuard would no-op on GET anyway, but
 * keeping reads off the entitlement code path avoids surprising future changes).
 */
export function TenantWrite(): ClassDecorator & MethodDecorator {
	return applyDecorators(UseGuards(OrganizationGuard, EntitlementGuard));
}

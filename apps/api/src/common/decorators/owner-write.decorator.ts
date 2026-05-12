import { EntitlementGuard } from '@/common/guards/entitlement.guard';
import { OwnerGuard } from '@/common/guards/owner.guard';
import { applyDecorators, UseGuards } from '@nestjs/common';

/**
 * Composite decorator for tenant-scoped write endpoints that require the OWNER role.
 * Applies:
 *  1. OwnerGuard — authenticates + verifies the current user holds OWNER on the active org
 *     (extends OrganizationGuard, so the auth + org checks happen exactly once).
 *  2. EntitlementGuard — returns 402 if the org has no active subscription / trial /
 *     past-due grace. Covers trial expiry, cancellation, unpaid, and similar states.
 *
 * Use on every controller method that mutates tenant data AND should be restricted to the
 * owner (billing actions, team invite/revoke, future destructive admin actions). For
 * member-accessible writes use `@TenantWrite()`; for member-readable routes use
 * `@UseGuards(OrganizationGuard)` alone.
 */
export function OwnerWrite(): ClassDecorator & MethodDecorator {
	return applyDecorators(UseGuards(OwnerGuard, EntitlementGuard));
}

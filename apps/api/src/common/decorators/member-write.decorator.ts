import { EntitlementGuard } from '@/common/guards/entitlement.guard';
import { TenantMemberGuard } from '@/common/guards/tenant-member.guard';
import { applyDecorators, UseGuards } from '@nestjs/common';

/**
 * Composite decorator for primary-member write endpoints. Applies:
 *  1. TenantMemberGuard — authenticates + attaches `request.organizationId` + rejects
 *     EXTERNAL roles (only OWNER + MEMBER may proceed).
 *  2. EntitlementGuard — returns 402 if the org has no active subscription / trial /
 *     past-due grace.
 *
 * Use on routes that contribute primary data (mailbox connections, integration tokens)
 * — anything where an EXTERNAL collaborator's participation would create confidentiality
 * or access-asymmetry problems for the org.
 *
 * For reads of the same kind of data, prefer `@UseGuards(TenantMemberGuard)` alone.
 */
export function MemberWrite(): ClassDecorator & MethodDecorator {
	return applyDecorators(UseGuards(TenantMemberGuard, EntitlementGuard));
}

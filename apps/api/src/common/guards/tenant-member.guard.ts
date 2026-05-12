import { OrganizationGuard } from '@/common/guards/organization.guard';
import { MembershipRole } from '@/generated/prisma/client';
import { MEMBER_ROLE_REQUIRED } from '@/lib/errors';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Authenticates + requires the current user to hold a MEMBER or OWNER role on the active
 * org. EXTERNAL is rejected.
 *
 * Use on routes that any "primary" team member can access but where EXTERNAL collaborators
 * (contractors, accountants) should be blocked — typically because the route brings new
 * primary data into the org (a connected mailbox, an integration credential, a synced
 * calendar). EXTERNAL is a consumer role, not a contributor role.
 *
 * For "any member of the org" without role discrimination, use `OrganizationGuard`.
 * For "the org's owner only", use `OwnerGuard`.
 */
@Injectable()
export class TenantMemberGuard extends OrganizationGuard {
	constructor(prisma: PrismaService) {
		super(prisma);
	}

	override async canActivate(context: ExecutionContext): Promise<boolean> {
		await super.canActivate(context);

		const request = context.switchToHttp().getRequest<Request>();
		const userId = request.authSession?.user?.id;
		const organizationId = request.organizationId;

		if (!userId || !organizationId) {
			throw new ForbiddenException(MEMBER_ROLE_REQUIRED);
		}

		const membership = await this.prisma.membership.findFirst({
			where: {
				userId,
				organizationId,
				role: { in: [MembershipRole.OWNER, MembershipRole.MEMBER] }
			},
			select: { id: true }
		});

		if (!membership) {
			throw new ForbiddenException(MEMBER_ROLE_REQUIRED);
		}

		return true;
	}
}

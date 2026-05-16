import { AuthGuard } from '@/common/guards/auth.guard';
import { NO_ACTIVE_ORGANIZATION } from '@/lib/errors';
import { logContext } from '@/modules/logger/log-context';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Authenticates the request AND requires an active organization on the user.
 * Use on any route that operates within a tenant boundary — which is most routes.
 *
 * Attaches `request.organizationId` for downstream services to scope queries by.
 * Extends AuthGuard so the auth check runs exactly once per request.
 *
 * Reads `User.currentOrganizationId` from the DB on every call (not from the JWT) so
 * that switching the active organization takes effect immediately — no JWT refresh
 * dance. The DB row is the source of truth; the JWT only carries `userId`.
 *
 * **Re-verifies membership on every request** (2026-05-17 hardening). Just because the
 * user's `currentOrganizationId` points at an org doesn't mean they're still a member —
 * the org's OWNER may have removed them since the last sign-in, but the pointer would
 * be stale. Without this check, a removed member could still read the org's data until
 * they next sign in. We re-prove membership cheaply on every request via the
 * `Membership` unique index `(userId, organizationId)`.
 */
@Injectable()
export class OrganizationGuard extends AuthGuard {
	constructor(protected readonly prisma: PrismaService) {
		super();
	}

	override async canActivate(context: ExecutionContext): Promise<boolean> {
		await super.canActivate(context);

		const request = context.switchToHttp().getRequest<Request>();
		const userId = request.authSession?.user?.id;
		if (!userId) {
			throw new ForbiddenException(NO_ACTIVE_ORGANIZATION);
		}

		const user = await this.prisma.user.findUnique({
			where: { id: userId },
			select: { currentOrganizationId: true }
		});

		if (!user?.currentOrganizationId) {
			throw new ForbiddenException(NO_ACTIVE_ORGANIZATION);
		}

		// Re-prove membership — guards against a stale `currentOrganizationId` after the
		// user has been removed from the org. Uses the (userId, organizationId) unique
		// index so this is one indexed point-lookup per request, not a real cost.
		const membership = await this.prisma.membership.findUnique({
			where: {
				userId_organizationId: {
					userId,
					organizationId: user.currentOrganizationId
				}
			},
			select: { id: true }
		});

		if (!membership) {
			throw new ForbiddenException(NO_ACTIVE_ORGANIZATION);
		}

		request.organizationId = user.currentOrganizationId;

		// Same intent as AuthGuard's userId push — once we resolve the active org we attach
		// it to the log context so persisted log rows include it. No-op outside a request
		// boundary (e.g. tests that bypass the middleware).
		logContext.set({ organizationId: user.currentOrganizationId });

		return true;
	}
}

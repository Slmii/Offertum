import { ENTITLED_STRIPE_STATUSES } from '@/modules/billing/billing.constants';
import type { PrismaService } from '@/modules/prisma/prisma.service';

/**
 * Returns true if `organizationId` is currently in a Stripe state that permits writes
 * (`trialing | active | past_due`). False for canceled/unpaid/incomplete_expired/no-sub.
 *
 * **Why a free function rather than `EntitlementGuard`:** OAuth flows are HTTP GET
 * (Google + Microsoft redirect users back via GET). The guard skips entitlement checks
 * for GETs by design (typical "reads don't need entitlement" pattern), so route-level
 * decorators don't help here. The OAuth callback handler calls this directly between
 * state-verification and `upsertEmailAccount` to keep canceled / unsubscribed orgs from
 * attaching new mailbox tokens. (2026-05-17 audit fix — H2.)
 *
 * Same semantics as the guard (single Subscription read by org), just inverted: caller
 * decides what to do with `false` (redirect to /billing, return early, etc.) rather
 * than the guard throwing a 402.
 */
export async function isOrganizationEntitled(prisma: PrismaService, organizationId: string): Promise<boolean> {
	const sub = await prisma.subscription.findUnique({
		where: { organizationId },
		select: { status: true }
	});
	return !!sub?.status && ENTITLED_STRIPE_STATUSES.includes(sub.status);
}

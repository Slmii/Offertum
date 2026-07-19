import { PricingCompileStatus as PrismaPricingCompileStatus } from '@/generated/prisma/enums';
import type { PricingCompileStatus } from '@offertum/shared';

/** Prisma UPPERCASE compile-status → lowercase wire value. Mirrors the other
 * `*-status.mapper.ts` files (opportunity, reply-draft, …). */
export const PRICING_COMPILE_STATUS_TO_WIRE: Record<PrismaPricingCompileStatus, PricingCompileStatus> = {
	[PrismaPricingCompileStatus.IDLE]: 'idle',
	[PrismaPricingCompileStatus.PROCESSING]: 'processing',
	[PrismaPricingCompileStatus.SUCCEEDED]: 'succeeded',
	[PrismaPricingCompileStatus.FAILED]: 'failed'
};

import { PricingRuleType as PrismaPricingRuleType } from '@/generated/prisma/enums';
import type { PricingRuleType as WirePricingRuleType } from '@offertum/shared';

/** Prisma UPPERCASE enum ↔ lowercase wire format. Same pattern as the other
 * `*-mapper.ts` files in the opportunities module. */

export const PRICING_RULE_TYPE_TO_WIRE: Record<PrismaPricingRuleType, WirePricingRuleType> = {
	HOURLY_RATE: 'hourly_rate',
	MATERIAL_MARKUP: 'material_markup',
	VAT: 'vat',
	TRAVEL: 'travel',
	URGENCY: 'urgency',
	DISCOUNT: 'discount',
	MINIMUM_ORDER: 'minimum_order'
};

export const PRICING_RULE_TYPE_FROM_WIRE: Record<WirePricingRuleType, PrismaPricingRuleType> = {
	hourly_rate: PrismaPricingRuleType.HOURLY_RATE,
	material_markup: PrismaPricingRuleType.MATERIAL_MARKUP,
	vat: PrismaPricingRuleType.VAT,
	travel: PrismaPricingRuleType.TRAVEL,
	urgency: PrismaPricingRuleType.URGENCY,
	discount: PrismaPricingRuleType.DISCOUNT,
	minimum_order: PrismaPricingRuleType.MINIMUM_ORDER
};

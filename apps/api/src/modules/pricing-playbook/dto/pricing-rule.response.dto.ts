import type { PricingRule, PricingRuleJsonObject, PricingRuleType } from '@offertum/shared';

/**
 * Wire-format `PricingRule` row. The `ruleType` here is the lowercase wire enum;
 * the controller converts from Prisma's UPPERCASE via `PRICING_RULE_TYPE_TO_WIRE`.
 */
export class PricingRuleResponseDto implements PricingRule {
	id!: string;
	ruleType!: PricingRuleType;
	condition!: PricingRuleJsonObject;
	effect!: PricingRuleJsonObject;
	priority!: number;
	active!: boolean;
	description!: string;
	conditionNarrative!: string | null;
	manualOverride!: boolean;
	createdAt!: string;
	updatedAt!: string;
}

export class PricingRulesListResponseDto {
	rules!: PricingRuleResponseDto[];
}

import type {
	CatalogItemUnit,
	PricingEffectType,
	ProposedQuoteLine,
	ProposeQuoteLinesResponse,
	QuoteLineSource
} from '@offertum/shared';

export class ProposedQuoteLineDto implements ProposedQuoteLine {
	description!: string;
	unit!: CatalogItemUnit;
	quantity!: number;
	unitPriceEur!: string | null;
	vatRate!: number;
	source!: QuoteLineSource;
	catalogItemId!: string | null;
	appliedRuleId!: string | null;
	ruleEffectType!: PricingEffectType | null;
	note!: string | null;
}

export class ProposeQuoteLinesResponseDto implements ProposeQuoteLinesResponse {
	lines!: ProposedQuoteLineDto[];
}

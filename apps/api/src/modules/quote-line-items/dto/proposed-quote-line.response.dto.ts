import type { CatalogItemUnit, ProposedQuoteLine, ProposeQuoteLinesResponse, QuoteLineSource } from '@offertum/shared';

export class ProposedQuoteLineDto implements ProposedQuoteLine {
	description!: string;
	unit!: CatalogItemUnit;
	quantity!: number;
	unitPriceEur!: string | null;
	vatRate!: number;
	source!: QuoteLineSource;
	catalogItemId!: string | null;
	appliedRuleId!: string | null;
	note!: string | null;
}

export class ProposeQuoteLinesResponseDto implements ProposeQuoteLinesResponse {
	lines!: ProposedQuoteLineDto[];
}

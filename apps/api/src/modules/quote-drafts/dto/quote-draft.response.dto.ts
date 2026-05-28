import type {
	QuoteDraft,
	QuoteDraftListResponse,
	QuoteDraftStatus,
	QuoteLineItem,
	QuoteLineSource
} from '@offertum/shared';

export class QuoteLineItemResponseDto implements QuoteLineItem {
	id!: string;
	position!: number;
	description!: string;
	unit!: string;
	quantity!: string;
	unitPriceEur!: string | null;
	vatRate!: number;
	vatReverseCharged!: boolean;
	source!: QuoteLineSource;
	wasEditedByUser!: boolean;
	catalogItemId!: string | null;
	appliedRuleId!: string | null;
	note!: string | null;
}

export class QuoteDraftResponseDto implements QuoteDraft {
	id!: string;
	opportunityId!: string;
	status!: QuoteDraftStatus;
	lineItems!: QuoteLineItemResponseDto[];
	createdAt!: string;
	updatedAt!: string;
	sentAt!: string | null;
}

export class QuoteDraftListResponseDto implements QuoteDraftListResponse {
	drafts!: QuoteDraftResponseDto[];
}

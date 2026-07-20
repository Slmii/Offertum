import type { QuotePdfResponseDto } from '@/modules/quote-pdfs/dto/quote-pdf.response.dto';
import type {
	PricingEffectType,
	QuoteDiscountType,
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
	ruleEffectType!: PricingEffectType | null;
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
	validUntil!: string | null;
	discountType!: QuoteDiscountType | null;
	discountValue!: string | null;
}

export class QuoteDraftListResponseDto implements QuoteDraftListResponse {
	drafts!: QuoteDraftResponseDto[];
	pdfs!: QuotePdfResponseDto[];
	pricingUpdatedAt!: string | null;
}

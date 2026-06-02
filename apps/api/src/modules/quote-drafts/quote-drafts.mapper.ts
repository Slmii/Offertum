import type { QuoteDraftWithLines } from '@/modules/quote-drafts/quote-drafts.repository';
import { QUOTE_DRAFT_STATUS_TO_WIRE } from '@/modules/quote-drafts/quote-draft-status.mapper';
import { QUOTE_LINE_SOURCE_TO_WIRE } from '@/modules/quote-drafts/quote-line-source.mapper';
import type { QuoteDraft, QuoteLineItem } from '@offertum/shared';

/**
 * Map a persisted `QuoteDraft` (with lines) to its wire shape. Decimal columns
 * become precision-preserving strings; Prisma enums become the lowercase wire
 * values. Pure — no IO — so it's unit-testable.
 */
export function toQuoteDraftWire(row: QuoteDraftWithLines): QuoteDraft {
	return {
		id: row.id,
		opportunityId: row.opportunityId,
		status: QUOTE_DRAFT_STATUS_TO_WIRE[row.status],
		lineItems: row.lineItems.map(toQuoteLineItemWire),
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
		sentAt: row.sentAt ? row.sentAt.toISOString() : null,
		validUntil: row.validUntil ? row.validUntil.toISOString() : null
	};
}

function toQuoteLineItemWire(line: QuoteDraftWithLines['lineItems'][number]): QuoteLineItem {
	return {
		id: line.id,
		position: line.position,
		description: line.description,
		unit: line.unit,
		quantity: line.quantity.toString(),
		unitPriceEur: line.unitPriceEur ? line.unitPriceEur.toString() : null,
		vatRate: line.vatRate,
		vatReverseCharged: line.vatReverseCharged,
		source: QUOTE_LINE_SOURCE_TO_WIRE[line.source],
		wasEditedByUser: line.wasEditedByUser,
		catalogItemId: line.catalogItemId,
		appliedRuleId: line.appliedRuleId,
		note: line.note
	};
}

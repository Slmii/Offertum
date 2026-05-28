import type { Prisma } from '@/generated/prisma/client';
import { LogService } from '@/modules/logger/log.service';
import { QuoteLineItemsService } from '@/modules/quote-line-items/quote-line-items.service';
import { toQuoteDraftWire } from '@/modules/quote-drafts/quote-drafts.mapper';
import { type CreateQuoteLineRepoInput, QuoteDraftsRepository } from '@/modules/quote-drafts/quote-drafts.repository';
import { QUOTE_LINE_SOURCE_FROM_WIRE } from '@/modules/quote-drafts/quote-line-source.mapper';
import { Injectable } from '@nestjs/common';
import type { ProposedQuoteLine, QuoteDraft } from '@offertum/shared';

/**
 * W10.2 — persists the W10.1 line-item proposal as a `QuoteDraft` + lines, and
 * reads drafts back. Generation (LLM-match / engine-price) stays in
 * `QuoteLineItemsService`; this service owns persistence + the audit/timeline
 * breadcrumb.
 */
@Injectable()
export class QuoteDraftsService {
	constructor(
		private readonly quoteLineItems: QuoteLineItemsService,
		private readonly repository: QuoteDraftsRepository,
		private readonly logService: LogService
	) {}

	/** Generate a proposal for the opportunity and persist it as a new draft. */
	async createForOpportunity(
		organizationId: string,
		opportunityId: string,
		actorUserId: string
	): Promise<QuoteDraft> {
		const result = await this.quoteLineItems.generate(organizationId, opportunityId);

		const row = await this.repository.create({
			organizationId,
			opportunityId,
			generationContext: result.generationContext as unknown as Prisma.InputJsonValue,
			aiCallId: result.aiCallId,
			lineItems: result.lines.map(toRepoLine)
		});

		this.logService.logAction({
			action: 'opportunity.quote_created',
			message: `Quote draft ${row.id} created for opportunity ${opportunityId} by user ${actorUserId}`,
			metadata: {
				organizationId,
				opportunityId,
				quoteDraftId: row.id,
				lineCount: row.lineItems.length,
				actorUserId
			},
			context: 'QuoteDraftsService'
		});

		return toQuoteDraftWire(row);
	}

	/** All persisted drafts for an opportunity (newest-first). */
	async listForOpportunity(organizationId: string, opportunityId: string): Promise<QuoteDraft[]> {
		const rows = await this.repository.listForOpportunity(organizationId, opportunityId);
		return rows.map(toQuoteDraftWire);
	}
}

function toRepoLine(line: ProposedQuoteLine, index: number): CreateQuoteLineRepoInput {
	return {
		position: index,
		description: line.description,
		unit: line.unit,
		quantity: line.quantity,
		unitPriceEur: line.unitPriceEur,
		vatRate: line.vatRate,
		source: QUOTE_LINE_SOURCE_FROM_WIRE[line.source],
		catalogItemId: line.catalogItemId,
		appliedRuleId: line.appliedRuleId,
		note: line.note
	};
}

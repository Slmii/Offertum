import type { Prisma } from '@/generated/prisma/client';
import { QUOTE_DRAFT_NOT_FOUND, QUOTE_LINE_ITEM_NOT_FOUND } from '@/lib/errors';
import { LogService } from '@/modules/logger/log.service';
import { QuoteLineItemsService } from '@/modules/quote-line-items/quote-line-items.service';
import { toQuoteDraftWire } from '@/modules/quote-drafts/quote-drafts.mapper';
import {
	type CreateQuoteLineRepoInput,
	type QuoteDraftWithLines,
	QuoteDraftsRepository
} from '@/modules/quote-drafts/quote-drafts.repository';
import { QUOTE_LINE_SOURCE_FROM_WIRE } from '@/modules/quote-drafts/quote-line-source.mapper';
import { Injectable, NotFoundException } from '@nestjs/common';
import type {
	CreateQuoteLineItemInput,
	ProposedQuoteLine,
	QuoteDraft,
	UpdateQuoteLineItemInput
} from '@offertum/shared';

const DEFAULT_LINE_UNIT = 'piece';

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

	/** Add an owner-authored line to a draft (W10.3). */
	async addLine(organizationId: string, quoteDraftId: string, input: CreateQuoteLineItemInput): Promise<QuoteDraft> {
		await this.loadDraft(organizationId, quoteDraftId);
		await this.repository.addLine(quoteDraftId, {
			description: input.description,
			unit: input.unit ?? DEFAULT_LINE_UNIT,
			quantity: input.quantity,
			unitPriceEur: input.unitPriceEur,
			vatRate: input.vatRate,
			vatReverseCharged: input.vatReverseCharged
		});
		return this.reload(organizationId, quoteDraftId);
	}

	/** Patch a line on a draft; flips its `wasEditedByUser` flag (W10.3). */
	async updateLine(
		organizationId: string,
		quoteDraftId: string,
		lineItemId: string,
		patch: UpdateQuoteLineItemInput
	): Promise<QuoteDraft> {
		await this.requireLine(organizationId, quoteDraftId, lineItemId);
		await this.repository.updateLine(lineItemId, patch);
		return this.reload(organizationId, quoteDraftId);
	}

	/** Remove a line from a draft (W10.3). */
	async deleteLine(organizationId: string, quoteDraftId: string, lineItemId: string): Promise<QuoteDraft> {
		await this.requireLine(organizationId, quoteDraftId, lineItemId);
		await this.repository.deleteLine(lineItemId);
		return this.reload(organizationId, quoteDraftId);
	}

	/** Load a tenant-scoped draft or 404. */
	private async loadDraft(organizationId: string, quoteDraftId: string): Promise<QuoteDraftWithLines> {
		const draft = await this.repository.findForOrganization(organizationId, quoteDraftId);
		if (!draft) {
			throw new NotFoundException(QUOTE_DRAFT_NOT_FOUND);
		}
		return draft;
	}

	/** Assert the line belongs to the tenant-scoped draft or 404. */
	private async requireLine(organizationId: string, quoteDraftId: string, lineItemId: string): Promise<void> {
		const draft = await this.loadDraft(organizationId, quoteDraftId);
		if (!draft.lineItems.some(line => line.id === lineItemId)) {
			throw new NotFoundException(QUOTE_LINE_ITEM_NOT_FOUND);
		}
	}

	private async reload(organizationId: string, quoteDraftId: string): Promise<QuoteDraft> {
		return toQuoteDraftWire(await this.loadDraft(organizationId, quoteDraftId));
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
		// Proposer never emits reverse-charge lines; the owner toggles it in W10.3.
		vatReverseCharged: false,
		source: QUOTE_LINE_SOURCE_FROM_WIRE[line.source],
		catalogItemId: line.catalogItemId,
		appliedRuleId: line.appliedRuleId,
		note: line.note
	};
}

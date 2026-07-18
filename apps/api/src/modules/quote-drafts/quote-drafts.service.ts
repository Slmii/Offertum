import type { Prisma } from '@/generated/prisma/client';
import {
	OPPORTUNITY_NOT_FOUND,
	QUOTE_DRAFT_ALREADY_SENT,
	QUOTE_DRAFT_HAS_UNPRICED_LINES,
	QUOTE_DRAFT_NOT_FOUND,
	QUOTE_EXPIRED_NO_PDF,
	QUOTE_LINE_ITEM_NOT_FOUND
} from '@/lib/errors';
import { CatalogItemsRepository } from '@/modules/catalog-items/catalog-items.repository';
import { LogService } from '@/modules/logger/log.service';
import { OpportunitiesRepository } from '@/modules/opportunities/opportunities.repository';
import { PricingPlaybookRepository } from '@/modules/pricing-playbook/pricing-playbook.repository';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { toQuoteDraftWire } from '@/modules/quote-drafts/quote-drafts.mapper';
import {
	type CreateQuoteLineRepoInput,
	type QuoteDraftWithLines,
	QuoteDraftsRepository,
	type ReplaceQuoteLineRepoInput
} from '@/modules/quote-drafts/quote-drafts.repository';
import { QUOTE_LINE_SOURCE_FROM_WIRE } from '@/modules/quote-drafts/quote-line-source.mapper';
import { QuoteLineItemsService } from '@/modules/quote-line-items/quote-line-items.service';
import type { QuotePdfLineItem } from '@/modules/quote-pdfs/quote-pdf.types';
import { QuotePdfsService } from '@/modules/quote-pdfs/quote-pdfs.service';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
	CatalogItemUnit,
	CreateQuoteLineItemInput,
	ProposedQuoteLine,
	QuoteDraft,
	QuoteDraftListResponse,
	QuotePdf,
	ReplaceQuoteLineInput,
	UpdateQuoteLineItemInput
} from '@offertum/shared';
import { computeQuoteTotals, formatQuoteNumber } from '@offertum/shared';
import { endOfDayInTimeZone, yearInTimeZone } from '@/lib/time/timezone';

const DEFAULT_LINE_UNIT = 'piece';
const DAY_MS = 24 * 60 * 60 * 1000;

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
		private readonly pricingPlaybook: PricingPlaybookRepository,
		private readonly catalogItems: CatalogItemsRepository,
		private readonly opportunities: OpportunitiesRepository,
		private readonly quotePdfs: QuotePdfsService,
		private readonly logService: LogService,
		private readonly prisma: PrismaService
	) {}

	/** Generate a proposal for the opportunity and persist it as a new draft. */
	async createForOpportunity(
		organizationId: string,
		opportunityId: string,
		actorUserId: string
	): Promise<QuoteDraft> {
		const result = await this.quoteLineItems.generate(organizationId, opportunityId);

		// Stamp the validity deadline once, at creation = now + the org's quoteValidityDays.
		// Persisted so the PDF, calendar expiry, and opp detail all read the same fixed date
		// (and a later change to the org default won't retroactively move existing quotes).
		const org = await this.prisma.organization.findUniqueOrThrow({
			where: { id: organizationId },
			select: { quoteValidityDays: true, timezone: true }
		});
		// Snap "Geldig tot" to end-of-day in the org's timezone so the quote stays valid through the
		// whole final day (and the server instant-check agrees with the client's calendar-day check).
		const validUntil = endOfDayInTimeZone(new Date(Date.now() + org.quoteValidityDays * DAY_MS), org.timezone);

		const row = await this.repository.create({
			organizationId,
			opportunityId,
			generationContext: result.generationContext as unknown as Prisma.InputJsonValue,
			aiCallId: result.aiCallId,
			validUntil,
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

	/** All persisted drafts for an opportunity (newest-first) + when the org's pricing
	 * last changed, so the UI can flag a draft whose pricing is now stale. */
	async listForOpportunity(organizationId: string, opportunityId: string): Promise<QuoteDraftListResponse> {
		const [rows, pricingUpdatedAt, pdfs] = await Promise.all([
			this.repository.listForOpportunity(organizationId, opportunityId),
			this.computePricingUpdatedAt(organizationId),
			this.quotePdfs.listForOpportunity(organizationId, opportunityId)
		]);
		return { drafts: rows.map(toQuoteDraftWire), pricingUpdatedAt, pdfs };
	}

	/** Replace every line on a draft (regenerate-merge apply). */
	async replaceLines(
		organizationId: string,
		quoteDraftId: string,
		lines: ReplaceQuoteLineInput[]
	): Promise<QuoteDraft> {
		this.assertEditable(await this.loadDraft(organizationId, quoteDraftId));
		// Drop provenance ids the client can't prove belong to this org, so a crafted
		// request can't poison the year-2 AI-accuracy analytics with dangling/foreign refs.
		const [catalogIds, ruleIds] = await Promise.all([
			this.loadCatalogItemIds(organizationId),
			this.loadRuleIds(organizationId)
		]);
		const sanitized = lines.map(line => ({
			...line,
			catalogItemId: line.catalogItemId && catalogIds.has(line.catalogItemId) ? line.catalogItemId : null,
			appliedRuleId: line.appliedRuleId && ruleIds.has(line.appliedRuleId) ? line.appliedRuleId : null
		}));
		await this.repository.replaceLines(quoteDraftId, sanitized.map(toReplaceRepoLine));
		return this.reload(organizationId, quoteDraftId);
	}

	private async loadCatalogItemIds(organizationId: string): Promise<Set<string>> {
		const rows = await this.catalogItems.listForOrganization(organizationId);
		return new Set(rows.map(row => row.id));
	}

	private async loadRuleIds(organizationId: string): Promise<Set<string>> {
		const playbook = await this.pricingPlaybook.findByOrganizationId(organizationId);
		if (!playbook) {
			return new Set();
		}
		const rows = await this.pricingPlaybook.listRules(playbook.id);
		return new Set(rows.map(row => row.id));
	}

	/** Most recent moment the org's pricing changed: the playbook compile time or the
	 * latest active-rule edit. Drives the "pricing changed since this quote" banner. */
	private async computePricingUpdatedAt(organizationId: string): Promise<string | null> {
		const playbook = await this.pricingPlaybook.findByOrganizationId(organizationId);
		if (!playbook) {
			return null;
		}
		const rules = await this.pricingPlaybook.listRules(playbook.id);
		const timestamps = [
			...(playbook.compiledAt ? [playbook.compiledAt.getTime()] : []),
			...rules.filter(rule => rule.active).map(rule => rule.updatedAt.getTime())
		];
		return timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : null;
	}

	/** Add an owner-authored line to a draft (W10.3). */
	async addLine(organizationId: string, quoteDraftId: string, input: CreateQuoteLineItemInput): Promise<QuoteDraft> {
		this.assertEditable(await this.loadDraft(organizationId, quoteDraftId));
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

	/** W10.4 — render the draft as a PDF and save it as a version in the opportunity's
	 * PDF history. Does NOT attach it; the owner picks a version to attach separately. */
	async generatePdfVersion(organizationId: string, quoteDraftId: string): Promise<QuotePdf> {
		const draft = await this.loadDraft(organizationId, quoteDraftId);

		// Refuse to produce a PDF whose total would be wrong because lines are unpriced.
		if (draft.lineItems.some(line => line.unitPriceEur === null)) {
			throw new BadRequestException(QUOTE_DRAFT_HAS_UNPRICED_LINES);
		}

		const opportunity = await this.opportunities.findDetailByIdForOrganization(organizationId, draft.opportunityId);
		if (!opportunity) {
			throw new NotFoundException(OPPORTUNITY_NOT_FOUND);
		}

		// Backfill validity for drafts that predate the stamping (validUntil = null) — anchored to
		// createdAt + the org window so the persisted value matches the creation-time stamp new
		// drafts get. Persisted once; re-generating a PDF keeps the same date. After this, the PDF,
		// calendar expiry, and opp detail all read the same stored validUntil.
		let validUntil = draft.validUntil;
		if (validUntil === null) {
			const org = await this.prisma.organization.findUniqueOrThrow({
				where: { id: organizationId },
				select: { quoteValidityDays: true, timezone: true }
			});
			validUntil = endOfDayInTimeZone(
				new Date(draft.createdAt.getTime() + org.quoteValidityDays * DAY_MS),
				org.timezone
			);
			// Conditional write so concurrent PDF generations don't double-stamp — only the first
			// writer (validUntil still null) wins. The computed value is deterministic (createdAt-
			// anchored), so the local `validUntil` is correct regardless of who won.
			await this.prisma.quoteDraft.updateMany({
				where: { id: quoteDraftId, validUntil: null },
				data: { validUntil }
			});
		}

		// Refuse to produce a PDF from an expired quote — its "Geldig tot"
		// date would already be in the past. Regenerate the quote first (which resets validUntil).
		if (validUntil.getTime() < Date.now()) {
			throw new BadRequestException(QUOTE_EXPIRED_NO_PDF);
		}

		// Assign (or reuse) the customer-facing quote number before rendering, so it's baked into the PDF.
		const quoteNumber = await this.resolveQuoteNumber(
			organizationId,
			quoteDraftId,
			draft.quoteNumber,
			draft.createdAt
		);

		const rendered = await this.quotePdfs.renderQuote(organizationId, {
			customerName: opportunity.customerName ?? 'Klant',
			customerEmail: opportunity.customerEmail,
			customerAddress: opportunity.address,
			quoteNumber,
			lineItems: draft.lineItems.map(toPdfLineItem),
			// Print the draft's creation date as the issue date and its stored validity deadline as
			// "Geldig tot" — the same values the calendar expiry event + opp detail read, so all three agree.
			issueDate: draft.createdAt,
			validUntil
		});

		// Snapshot the total incl. btw at generation time — all lines are priced (checked above),
		// so this is the final amount the customer sees on this PDF version.
		const totals = computeQuoteTotals(
			draft.lineItems.map(line => ({
				quantity: line.quantity.toString(),
				unitPriceEur: line.unitPriceEur === null ? null : line.unitPriceEur.toString(),
				vatRate: line.vatRate.toNumber(),
				vatReverseCharged: line.vatReverseCharged
			}))
		);

		const pdf = await this.quotePdfs.storeVersion(
			organizationId,
			draft.opportunityId,
			quoteDraftId,
			rendered,
			totals.grossCents,
			quoteNumber,
			validUntil
		);

		this.logService.logAction({
			action: 'opportunity.quote_pdf_generated',
			message: `Quote PDF ${pdf.filename} (version ${pdf.id}) generated for opportunity ${draft.opportunityId} from draft ${quoteDraftId}`,
			metadata: {
				organizationId,
				opportunityId: draft.opportunityId,
				quoteDraftId,
				quotePdfId: pdf.id,
				filename: pdf.filename
			},
			context: 'QuoteDraftsService'
		});

		return pdf;
	}

	/** Load a tenant-scoped draft or 404. */
	/**
	 * Assign a stable, org-unique quote number, or reuse the one already stamped on the draft
	 * (regenerating a PDF keeps the same number). Increments the org's lifetime counter atomically;
	 * if a concurrent regeneration of the SAME draft claimed the number first, that sequence value is
	 * skipped (gaps are fine) and the winner's number is reused — never a duplicate.
	 */
	private async resolveQuoteNumber(
		organizationId: string,
		quoteDraftId: string,
		existingNumber: string | null,
		issueDate: Date
	): Promise<string> {
		if (existingNumber) {
			return existingNumber;
		}

		const { quoteSequence, timezone } = await this.prisma.organization.update({
			where: { id: organizationId },
			data: { quoteSequence: { increment: 1 } },
			select: { quoteSequence: true, timezone: true }
		});
		// Year in the org's timezone, not UTC — a quote created just after local midnight on Jan 1
		// must carry the new year, not the previous one.
		const quoteNumber = formatQuoteNumber(yearInTimeZone(issueDate, timezone), quoteSequence);

		// Claim the number only if the draft is still unnumbered — guards against a concurrent
		// regeneration double-assigning.
		const claim = await this.prisma.quoteDraft.updateMany({
			where: { id: quoteDraftId, quoteNumber: null },
			data: { quoteNumber }
		});
		if (claim.count === 0) {
			const row = await this.prisma.quoteDraft.findUniqueOrThrow({
				where: { id: quoteDraftId },
				select: { quoteNumber: true }
			});
			return row.quoteNumber ?? quoteNumber;
		}
		return quoteNumber;
	}

	private async loadDraft(organizationId: string, quoteDraftId: string): Promise<QuoteDraftWithLines> {
		const draft = await this.repository.findForOrganization(organizationId, quoteDraftId);
		if (!draft) {
			throw new NotFoundException(QUOTE_DRAFT_NOT_FOUND);
		}
		return draft;
	}

	/** Assert the line belongs to the tenant-scoped draft or 404, and that the draft is still editable. */
	private async requireLine(organizationId: string, quoteDraftId: string, lineItemId: string): Promise<void> {
		const draft = await this.loadDraft(organizationId, quoteDraftId);
		if (!draft.lineItems.some(line => line.id === lineItemId)) {
			throw new NotFoundException(QUOTE_LINE_ITEM_NOT_FOUND);
		}
		this.assertEditable(draft);
	}

	/** Reject mutations against a quote draft that's already been sent to the customer. */
	private assertEditable(draft: QuoteDraftWithLines): void {
		if (draft.status === 'SENT') {
			throw new BadRequestException(QUOTE_DRAFT_ALREADY_SENT);
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

/** Persisted line → PDF line. Callers must guarantee `unitPriceEur` is non-null. */
function toPdfLineItem(line: QuoteDraftWithLines['lineItems'][number]): QuotePdfLineItem {
	return {
		description: line.description,
		unit: line.unit as CatalogItemUnit,
		unitPriceEur: (line.unitPriceEur ?? '0').toString(),
		quantity: Number(line.quantity.toString()),
		vatRate: line.vatRate.toNumber(),
		vatReverseCharged: line.vatReverseCharged
	};
}

function toReplaceRepoLine(line: ReplaceQuoteLineInput): ReplaceQuoteLineRepoInput {
	return {
		description: line.description,
		unit: line.unit,
		quantity: line.quantity,
		unitPriceEur: line.unitPriceEur,
		vatRate: line.vatRate,
		vatReverseCharged: line.vatReverseCharged,
		source: QUOTE_LINE_SOURCE_FROM_WIRE[line.source],
		catalogItemId: line.catalogItemId,
		appliedRuleId: line.appliedRuleId,
		note: line.note,
		wasEditedByUser: line.wasEditedByUser
	};
}

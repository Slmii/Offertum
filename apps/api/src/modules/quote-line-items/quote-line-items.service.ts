import { OPPORTUNITY_NOT_FOUND } from '@/lib/errors';
import { buildRawMessageAIInput } from '@/lib/email/raw-message-ai-input';
import { LineItemProposerService } from '@/modules/ai/line-item-proposer/line-item-proposer.service';
import type { LineItemProposerCatalogEntry } from '@/modules/ai/line-item-proposer/line-item-proposer.types';
import { CatalogItemsRepository } from '@/modules/catalog-items/catalog-items.repository';
import { OPPORTUNITY_URGENCY_TO_WIRE } from '@/modules/opportunities/opportunity-urgency.mapper';
import { OpportunitiesRepository } from '@/modules/opportunities/opportunities.repository';
import { PricingPlaybookRepository } from '@/modules/pricing-playbook/pricing-playbook.repository';
import { type ResolverCatalogEntry, resolveQuoteLines } from '@/modules/quote-line-items/quote-line-items.resolver';
import type { EvaluableRule } from '@/modules/pricing-playbook/rule-engine';
import { Injectable, NotFoundException } from '@nestjs/common';
import { CATALOG_ITEM_UNIT_LABELS_NL, type OpportunityUrgency, type ProposedQuoteLine } from '@offertum/shared';

/** Frozen snapshot of the opportunity inputs the proposer saw, persisted on the
 * `QuoteDraft` for reproducibility + the year-2 self-improvement story. */
export interface QuoteGenerationContext {
	requestType: string;
	deliverableHints: string[];
	urgency: OpportunityUrgency | null;
	catalogItemCount: number;
	ruleCount: number;
	generatedAt: string;
}

/** Result of a full quote generation: resolved lines + provenance for persistence. */
export interface QuoteProposalResult {
	lines: ProposedQuoteLine[];
	aiCallId: string | null;
	generationContext: QuoteGenerationContext;
}

/**
 * W10.1 orchestrator (LLM-match / engine-price). Loads the opportunity context +
 * the org's active catalog + active pricing rules, asks the LLM which catalog
 * items + quantities apply (no prices), then resolves every number
 * deterministically via `resolveQuoteLines`.
 *
 * The catalog is handed to the model as short refs (`C1`…) WITHOUT prices, so the
 * model can't anchor on or invent a number; pricing comes only from the catalog
 * rows + the rule engine.
 */
@Injectable()
export class QuoteLineItemsService {
	constructor(
		private readonly opportunities: OpportunitiesRepository,
		private readonly catalogItems: CatalogItemsRepository,
		private readonly pricingPlaybook: PricingPlaybookRepository,
		private readonly proposer: LineItemProposerService
	) {}

	/** Preview path (W10.1): just the resolved lines, nothing persisted. */
	async proposeForOpportunity(organizationId: string, opportunityId: string): Promise<ProposedQuoteLine[]> {
		const result = await this.generate(organizationId, opportunityId);
		return result.lines;
	}

	/**
	 * Full generation (W10.2): resolved lines + the AICall id that produced them +
	 * a frozen snapshot of the opportunity context, so `QuoteDraftsService` can
	 * persist a reproducible draft.
	 */
	async generate(organizationId: string, opportunityId: string): Promise<QuoteProposalResult> {
		const opportunity = await this.opportunities.findDetailByIdForOrganization(organizationId, opportunityId);
		if (!opportunity) {
			throw new NotFoundException(OPPORTUNITY_NOT_FOUND);
		}

		const [catalogRows, rules] = await Promise.all([
			this.catalogItems.listForOrganization(organizationId),
			this.loadActiveRules(organizationId)
		]);
		const activeCatalog = catalogRows.filter(item => item.active);

		// Short refs (C1…) keep the model from garbling UUIDs; the map resolves the
		// ref back to the real catalog row downstream.
		const catalogByRef = new Map<string, ResolverCatalogEntry>();
		const proposerCatalog: LineItemProposerCatalogEntry[] = activeCatalog.map((item, index) => {
			const ref = `C${index + 1}`;
			catalogByRef.set(ref, {
				id: item.id,
				name: item.name,
				unit: item.unit,
				unitPriceEur: item.defaultPriceEur,
				vatRate: item.defaultVatRate
			});
			return {
				ref,
				name: item.name,
				description: item.description,
				unitLabel: CATALOG_ITEM_UNIT_LABELS_NL[item.unit]
			};
		});

		const bodyText = buildRawMessageAIInput({
			provider: opportunity.rawMessage.emailAccount.provider,
			subject: opportunity.rawMessage.subject,
			fromName: opportunity.rawMessage.fromName,
			fromEmail: opportunity.rawMessage.fromEmail,
			raw: opportunity.rawMessage.raw
		}).bodyText;

		const deliverableHints = toStringArray(opportunity.deliverableHints);
		const urgency = OPPORTUNITY_URGENCY_TO_WIRE[opportunity.urgency];

		const proposal = await this.proposer.propose({
			requestType: opportunity.requestType,
			deliverableHints,
			bodyText,
			catalog: proposerCatalog
		});

		const lines = resolveQuoteLines({
			proposal: proposal.value,
			catalogByRef,
			rules,
			urgency
		});

		return {
			lines,
			aiCallId: proposal.callId,
			generationContext: {
				requestType: opportunity.requestType,
				deliverableHints,
				urgency,
				catalogItemCount: activeCatalog.length,
				ruleCount: rules.length,
				generatedAt: new Date().toISOString()
			}
		};
	}

	/** Load the org's active pricing rules as `EvaluableRule`s for the engine. */
	private async loadActiveRules(organizationId: string): Promise<EvaluableRule[]> {
		const playbook = await this.pricingPlaybook.findByOrganizationId(organizationId);
		if (!playbook) {
			return [];
		}
		const rows = await this.pricingPlaybook.listRules(playbook.id);
		return rows
			.filter(row => row.active)
			.map(row => ({
				id: row.id,
				ruleType: row.ruleType,
				condition: row.condition,
				effect: row.effect,
				priority: row.priority,
				active: row.active,
				manualOverride: row.manualOverride,
				description: row.description,
				// `sourceSpan` was dropped from the schema; the engine still accepts the
				// field as nullable for backward-compat.
				sourceSpan: null,
				createdAt: row.createdAt
			}));
	}
}

function toStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.filter((item): item is string => typeof item === 'string');
}

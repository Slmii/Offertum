import { buildRawMessageAIInput } from '@/lib/email/raw-message-ai-input';
import { OPPORTUNITY_NOT_FOUND } from '@/lib/errors';
import { GeocodingService } from '@/lib/geo/geocoding.service';
import { haversineKm } from '@/lib/geo/haversine';
import { LineItemProposerService } from '@/modules/ai/line-item-proposer/line-item-proposer.service';
import type { LineItemProposerCatalogEntry } from '@/modules/ai/line-item-proposer/line-item-proposer.types';
import { PricingNarrativeVerifierService } from '@/modules/ai/pricing-narrative-verifier/pricing-narrative-verifier.service';
import type { PricingNarrativeQuoteContext } from '@/modules/ai/pricing-narrative-verifier/pricing-narrative-verifier.types';
import { CatalogItemsRepository } from '@/modules/catalog-items/catalog-items.repository';
import { OpportunitiesRepository } from '@/modules/opportunities/opportunities.repository';
import { OPPORTUNITY_URGENCY_TO_WIRE } from '@/modules/opportunities/opportunity-urgency.mapper';
import { PricingPlaybookRepository, type PricingRuleRow } from '@/modules/pricing-playbook/pricing-playbook.repository';
import { PrismaService } from '@/modules/prisma/prisma.service';
import type { EvaluableRule } from '@/modules/pricing-playbook/rule-engine';
import {
	hasNarrative,
	resolveConfirmedNarrativeRuleIds,
	selectRulesPassingNarrativeGate
} from '@/modules/quote-line-items/pricing-rule-narrative-gate';
import { type ResolverCatalogEntry, resolveQuoteLines } from '@/modules/quote-line-items/quote-line-items.resolver';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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
	private readonly logger = new Logger(QuoteLineItemsService.name);

	constructor(
		private readonly opportunities: OpportunitiesRepository,
		private readonly catalogItems: CatalogItemsRepository,
		private readonly pricingPlaybook: PricingPlaybookRepository,
		private readonly proposer: LineItemProposerService,
		private readonly narrativeVerifier: PricingNarrativeVerifierService,
		private readonly geocoding: GeocodingService,
		private readonly prisma: PrismaService
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

		const [catalogRows, activeRuleRows] = await Promise.all([
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

		const { bodyText } = buildRawMessageAIInput({
			provider: opportunity.rawMessage.emailAccount.provider,
			subject: opportunity.rawMessage.subject,
			fromName: opportunity.rawMessage.fromName,
			fromEmail: opportunity.rawMessage.fromEmail,
			raw: opportunity.rawMessage.raw
		});

		const deliverableHints = toStringArray(opportunity.deliverableHints);
		const urgency = OPPORTUNITY_URGENCY_TO_WIRE[opportunity.urgency];

		const narrativeContext: PricingNarrativeQuoteContext = {
			requestType: opportunity.requestType,
			deliverableHints,
			bodyText,
			customerName: opportunity.customerName,
			customerEmail: opportunity.customerEmail,
			address: opportunity.address
		};

		// Only geocode when a per-km TRAVEL rule actually exists — otherwise the distance is computed
		// and discarded (the resolver has nothing to bill it against), so we'd pay two PDOK round-trips
		// + an external failure surface on every quote for nothing.
		const hasPerKmTravelRule = activeRuleRows.some(
			row => row.ruleType === 'TRAVEL' && (row.effect as { type?: unknown }).type === 'per_km_eur'
		);

		// The proposer, narrative verification, and travel geocoding are all independent I/O — run
		// them in parallel so neither "AI controleert" nor the PDOK geocode adds wall-clock latency.
		const [proposal, confirmedNarrativeRuleIds, travelOneWayKm] = await Promise.all([
			this.proposer.propose({
				requestType: opportunity.requestType,
				deliverableHints,
				bodyText,
				catalog: proposerCatalog
			}),
			this.verifyNarrativeRules(organizationId, activeRuleRows, narrativeContext),
			this.computeTravelDistanceKm(organizationId, opportunity.address, hasPerKmTravelRule)
		]);

		// Only structural rules + AI-confirmed narrative rules reach the deterministic engine.
		const rules = selectRulesPassingNarrativeGate(activeRuleRows, confirmedNarrativeRuleIds).map(toEvaluableRule);

		const lines = resolveQuoteLines({
			proposal: proposal.value,
			catalogByRef,
			rules,
			urgency,
			travelOneWayKm
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

	/** Load the org's active pricing rules (raw rows — the narrative gate + engine
	 * mapping happen in `generate` once verification has run). */
	private async loadActiveRules(organizationId: string): Promise<PricingRuleRow[]> {
		const playbook = await this.pricingPlaybook.findByOrganizationId(organizationId);
		if (!playbook) {
			return [];
		}
		const rows = await this.pricingPlaybook.listRules(playbook.id);
		return rows.filter(row => row.active);
	}

	/**
	 * One-way straight-line (geocoded) distance in km from the org's base address to the customer, for
	 * per-km travel rules — the raw PDOK-derived distance, no road-detour factor applied. Best-effort:
	 * no per-km rule, no customer address, no org `companyAddress`, or a geocode miss → `undefined`
	 * (the resolver then skips per-km travel — it never fails the quote). Round-trip (×2) is applied
	 * downstream by the resolver.
	 */
	private async computeTravelDistanceKm(
		organizationId: string,
		customerAddress: string | null,
		hasPerKmTravelRule: boolean
	): Promise<number | undefined> {
		if (!hasPerKmTravelRule || !customerAddress || customerAddress.trim().length === 0) {
			return undefined;
		}
		// Fail-soft in full: travel is optional, so NOTHING here — the org lookup included — may reject
		// the parallel quote-generation call. A DB blip or geocode error just skips per-km travel.
		try {
			const org = await this.prisma.organization.findUnique({
				where: { id: organizationId },
				select: { companyAddress: true }
			});
			const baseAddress = org?.companyAddress?.trim();
			if (!baseAddress) {
				return undefined;
			}
			const [origin, destination] = await Promise.all([
				this.geocoding.geocode(baseAddress),
				this.geocoding.geocode(customerAddress)
			]);
			if (!origin || !destination) {
				return undefined;
			}
			return haversineKm(origin, destination);
		} catch (error) {
			this.logger.warn(
				`Travel distance lookup failed for org ${organizationId}; skipping per-km travel. ${
					error instanceof Error ? error.message : 'unknown error'
				}`
			);
			return undefined;
		}
	}

	/**
	 * "AI controleert" — ask the model which narrative-gated rules apply to this quote and
	 * return the set of confirmed rule ids. Short-circuits with an empty set when there are
	 * no narrative rules (no AI call, no cost). Fail-closed: any error → empty set, so an
	 * unverified narrative exception never reaches the engine and can't silently override
	 * the default pricing.
	 */
	private async verifyNarrativeRules(
		organizationId: string,
		rows: readonly PricingRuleRow[],
		context: PricingNarrativeQuoteContext
	): Promise<Set<string>> {
		const narrativeRows = rows.filter(hasNarrative);
		if (narrativeRows.length === 0) {
			return new Set();
		}
		// The verifier's verdict schema caps at 50 entries — beyond that a valid response can't parse
		// and every narrative rule fails closed (drops) for this quote. Log it so that silent drop is
		// observable rather than a mystery (an org with >50 narrative-gated rules is pathological).
		if (narrativeRows.length > 50) {
			this.logger.warn(
				`Org ${organizationId} has ${narrativeRows.length} narrative-gated pricing rules (>50 verdict cap); some exceptions may fail closed on this quote.`
			);
		}

		const refToRuleId = new Map<string, string>();
		const rules = narrativeRows.map((row, index) => {
			const ref = `R${index + 1}`;
			refToRuleId.set(ref, row.id);
			return { ref, description: row.description, narrative: (row.conditionNarrative ?? '').trim() };
		});

		try {
			const result = await this.narrativeVerifier.verify({ context, rules });
			return resolveConfirmedNarrativeRuleIds(refToRuleId, result.value.verdicts);
		} catch (error) {
			this.logger.warn(
				`Pricing-narrative verification failed for org ${organizationId}; applying no narrative-gated rules (fail-closed). ${
					error instanceof Error ? error.message : 'unknown error'
				}`
			);
			return new Set();
		}
	}
}

/** Map a persisted rule row to the engine's `EvaluableRule` shape. */
function toEvaluableRule(row: PricingRuleRow): EvaluableRule {
	return {
		id: row.id,
		ruleType: row.ruleType,
		condition: row.condition,
		effect: row.effect,
		priority: row.priority,
		active: row.active,
		manualOverride: row.manualOverride,
		description: row.description,
		// `sourceSpan` was dropped from the schema; the engine still accepts the field as
		// nullable for backward-compat.
		sourceSpan: null,
		createdAt: row.createdAt
	};
}

function toStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.filter((item): item is string => typeof item === 'string');
}

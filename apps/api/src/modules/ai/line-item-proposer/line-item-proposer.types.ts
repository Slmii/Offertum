import { CATALOG_ITEM_UNITS } from '@offertum/shared';
import { z } from 'zod';

/**
 * Input to `LineItemProposerService.propose()`. The opportunity context the AI
 * matches against the catalog, plus the catalog itself rendered as short refs
 * (`C1`, `C2`, …) — NOT UUIDs. Two reasons for refs:
 *  1. Models echo back a `C3` reliably; they garble/hallucinate 36-char UUIDs.
 *  2. The catalog is given WITHOUT prices, so the model can't anchor on or invent
 *     a number — pricing is resolved deterministically downstream (engine-price).
 */
export interface LineItemProposerInput {
	/** Short summary of the work, from `Opportunity.requestType`. */
	requestType: string;
	/** Incidental nouns/scope hints the extractor pulled (e.g. "3x3m2", "tegels"). */
	deliverableHints: string[];
	/** Plain-text body of the originating request, HTML stripped (≤ ~4kB). Gives
	 * the model the customer's own words for matching beyond the summary. */
	bodyText: string;
	/** Active catalog items the model may match against, each with a stable ref. */
	catalog: LineItemProposerCatalogEntry[];
}

export interface LineItemProposerCatalogEntry {
	/** Stable short ref shown to the model (`C1`…). Maps back to the real id downstream. */
	ref: string;
	name: string;
	description: string | null;
	/** Dutch unit label (e.g. "uur", "m²") so the model reasons about quantity sanely. */
	unitLabel: string;
}

/**
 * Zod schema for the proposer output. OpenAI strict structured-outputs constraint:
 * every key required + `.nullable()` for optionality, no open shapes / records.
 *
 * The model does TWO things:
 *  - `catalogLines`: pick catalog refs that match the request + a quantity + a one-
 *    line reason. Price/VAT are NOT here — resolved from the catalog row downstream.
 *  - `inferredLines`: work it could NOT map to a catalog item (description +
 *    quantity + unit + lineKind). No price — the owner sets it, OR an hourly-rate
 *    rule prices labor lines downstream.
 */
export const ProposedCatalogLineSchema = z.object({
	/** Catalog ref the model chose (`C1`…). Verified against the real catalog
	 * downstream; unknown refs are dropped. */
	ref: z.string().min(1),
	quantity: z.number().positive(),
	/** One short Dutch reason (audit/debug only; not shown to the customer). */
	reason: z.string()
});

export const ProposedInferredLineSchema = z.object({
	description: z.string().min(1),
	unit: z.enum(CATALOG_ITEM_UNITS),
	quantity: z.number().positive(),
	/** Labor vs material — drives hourly-rate pricing + VAT split downstream.
	 * NULL when the model can't tell. */
	lineKind: z.enum(['labor', 'material']).nullable(),
	reason: z.string()
});

export const LineItemProposalSchema = z.object({
	catalogLines: z.array(ProposedCatalogLineSchema).max(50),
	inferredLines: z.array(ProposedInferredLineSchema).max(50)
});

export type LineItemProposal = z.infer<typeof LineItemProposalSchema>;
export type ProposedCatalogLine = z.infer<typeof ProposedCatalogLineSchema>;
export type ProposedInferredLine = z.infer<typeof ProposedInferredLineSchema>;

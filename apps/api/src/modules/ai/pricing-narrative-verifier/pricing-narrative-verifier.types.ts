import { z } from 'zod';

/**
 * Input to `PricingNarrativeVerifierService.verify()`. A pricing rule can carry a
 * free-text `conditionNarrative` — a qualifier the structured `condition` enum can't
 * express (e.g. "renovaties van woningen ouder dan 2 jaar", "klanten in België"). The
 * structured engine can't evaluate those, so at quote time we ask the model, per rule,
 * whether the narrative actually applies to THIS quote. Only confirmed rules are then
 * fed to the deterministic engine.
 *
 * Rules are addressed by short refs (`R1`, `R2`, …) — the same trick the line-item
 * proposer uses with `C1`… — so the model echoes back a stable token instead of
 * garbling a 36-char UUID.
 */
export interface PricingNarrativeVerifierInput {
	context: PricingNarrativeQuoteContext;
	rules: PricingNarrativeRule[];
}

/** The quote context the model judges each narrative against. */
export interface PricingNarrativeQuoteContext {
	/** Short summary of the work, from `Opportunity.requestType`. */
	requestType: string;
	/** Incidental scope hints the extractor pulled (e.g. "3x3m2", "tegels"). */
	deliverableHints: string[];
	/** Plain-text body of the originating request, HTML stripped (≤ ~4kB) — the
	 * customer's own words, needed to judge narratives like "ouder dan 2 jaar". */
	bodyText: string;
	/** Customer identity — lets the model judge origin-based narratives ("klanten in
	 * België") from an email domain or signature. `null` when unknown. */
	customerName: string | null;
	customerEmail: string | null;
	/** Extracted job location — surfaced as a first-class field (not just buried in `bodyText`) so
	 * the model reliably judges location narratives ("binnen/buiten Utrecht", "in Amsterdam"). `null`
	 * when the request gave no address. */
	address: string | null;
}

/** One narrative-gated rule to check. */
export interface PricingNarrativeRule {
	/** Stable short ref shown to the model (`R1`…). Maps back to the real rule id. */
	ref: string;
	/** What the rule does (its `description`) — context for judging relevance. */
	description: string;
	/** The free-text condition to verify against the quote. */
	narrative: string;
}

/**
 * Per-rule verdict. `applies` is `true` ONLY when the quote clearly satisfies the
 * narrative; anything uncertain must come back `false` so an unjustified exception
 * can't silently override the default pricing (fail-closed). OpenAI strict
 * structured-outputs: every key required, no open shapes.
 */
export const PricingNarrativeVerdictSchema = z.object({
	ref: z.string().min(1),
	applies: z.boolean(),
	reason: z.string()
});

export const PricingNarrativeVerificationSchema = z.object({
	verdicts: z.array(PricingNarrativeVerdictSchema).max(50)
});

export type PricingNarrativeVerdict = z.infer<typeof PricingNarrativeVerdictSchema>;
export type PricingNarrativeVerification = z.infer<typeof PricingNarrativeVerificationSchema>;

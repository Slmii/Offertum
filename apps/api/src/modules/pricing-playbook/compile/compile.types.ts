import { PRICING_RULE_TYPES } from '@quoteom/shared';
import { z } from 'zod';

/**
 * Zod schema for the LLM compile pass output.
 *
 * **OpenAI structured-outputs constraint:** the strict JSON schema mode rejects
 * `propertyNames`, `additionalProperties: true`, and any open-shape objects.
 * Every object key must be explicitly declared + non-optional (use `.nullable()`
 * for optionality). That rules out `z.record(z.string(), ...)` — so `condition`
 * + `effect` are closed shapes here, covering all the documented condition/effect
 * keys from the Dutch compile prompt. Unused keys come back as `null` and get
 * stripped before persistence (see `pruneNulls` in compile.service).
 */

const ConditionSchema = z.object({
	/** Vakgebied / industrie (lowercase, e.g. "plumbing"). NULL = matches any category. */
	category: z.string().nullable(),
	/** Customer urgency tier this rule applies to. NULL = applies regardless. */
	urgency: z.enum(['emergency', 'high', 'normal', 'low']).nullable(),
	/** Tax jurisdiction (NL / BE / DE). NULL = applies regardless. */
	jurisdiction: z.enum(['NL', 'BE', 'DE']).nullable(),
	/** Labor vs. material line (e.g. for VAT split). NULL = applies to both. */
	lineKind: z.enum(['labor', 'material']).nullable()
});

const EffectSchema = z.object({
	/**
	 * Effect discriminator. The DB CHECK constraint enforces this is non-empty;
	 * the engine routes on it. Allowed values (per the Dutch compile prompt):
	 *   rate_eur_per_hour, markup_percent, vat_rate, flat_fee_eur, per_km_eur,
	 *   surcharge_percent, discount_percent, discount_eur, minimum_eur.
	 */
	type: z.string().min(1),
	/** The numeric value the effect applies (rate, percentage, euros). */
	value: z.number(),
	/** Travel-only: km below which the per_km_eur charge is waived. NULL otherwise. */
	freeUnderKm: z.number().nullable()
});

export const PricingRuleCompileSchema = z.object({
	ruleType: z.enum(PRICING_RULE_TYPES),
	condition: ConditionSchema,
	effect: EffectSchema,
	priority: z.number().int().min(0).max(1000),
	description: z.string().min(1).max(500),
	sourceSpan: z.object({ start: z.number().int().min(0), end: z.number().int().min(0) }).nullable()
});

export const PricingPlaybookCompileSchema = z.object({
	rules: z.array(PricingRuleCompileSchema).max(100)
});

export type PricingRuleCompileOutput = z.infer<typeof PricingRuleCompileSchema>;
export type PricingPlaybookCompileOutput = z.infer<typeof PricingPlaybookCompileSchema>;

/**
 * Strip `null` keys from an object so the DB doesn't store `{ category: null,
 * urgency: null }` blobs that would weaken the rule-engine's "missing key =
 * matches anything" semantic.
 */
export function pruneNulls(input: Record<string, unknown>): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(input)) {
		if (value !== null) {
			result[key] = value;
		}
	}
	return result;
}

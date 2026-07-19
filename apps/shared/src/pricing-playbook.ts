/**
 * Pricing-playbook wire types. The owner authors prose in `playbookText`; the
 * compile pass (Inngest function `pricing-playbook-compile`) turns it into typed
 * `PricingRule[]` rows the quote pipeline evaluates deterministically.
 *
 * Wire format conventions match the rest of the app: lowercase enum values
 * (Prisma stores UPPERCASE; mappers convert at the controller boundary).
 */

/**
 * Compile-pass status surfaced to the settings page. Lowercase wire values (Prisma stores
 * UPPERCASE; `pricing-compile-status.mapper.ts` converts at the controller boundary).
 *   - `idle`       — never saved / never compiled (fresh org).
 *   - `processing` — saved; the debounced Inngest compile is enqueued or running.
 *   - `succeeded`  — compile finished (may still have produced zero rules).
 *   - `failed`     — compile errored after all retries.
 */
export const PRICING_COMPILE_STATUSES = ['idle', 'processing', 'succeeded', 'failed'] as const;
export type PricingCompileStatus = (typeof PRICING_COMPILE_STATUSES)[number];

export const PRICING_RULE_TYPES = [
	'hourly_rate',
	'material_markup',
	'vat',
	'travel',
	'urgency',
	'discount',
	'minimum_order'
] as const;
export type PricingRuleType = (typeof PRICING_RULE_TYPES)[number];

/**
 * Effect discriminators a compiled `PricingRule.effect` can carry — the `effect.type`
 * field. The compile prompt instructs exactly these tokens and the quote pipeline
 * routes on them. Unlike rule types, effect tokens are stored verbatim in the `effect`
 * JSON (no case conversion), so this one union is the single source of truth for both
 * the compiler's Zod schema and the resolver.
 */
export const PRICING_EFFECT_TYPES = [
	'rate_eur_per_hour',
	'markup_percent',
	'vat_rate',
	'flat_fee_eur',
	'per_km_eur',
	'surcharge_percent',
	'discount_percent',
	'discount_eur',
	'minimum_eur'
] as const;
export type PricingEffectType = (typeof PRICING_EFFECT_TYPES)[number];

/** Narrow an unknown `effect.type` (read off the open `effect` JSON) to the union,
 * so consumers can `switch` exhaustively over it. */
export function isPricingEffectType(value: unknown): value is PricingEffectType {
	return typeof value === 'string' && (PRICING_EFFECT_TYPES as readonly string[]).includes(value);
}

/**
 * JSON-safe value type for the `condition` + `effect` payloads. Used in place
 * of `Record<string, unknown>` so TanStack Start's server-fn return-type
 * validator can prove the shape is wire-serializable.
 */
export type PricingRuleJsonValue =
	| string
	| number
	| boolean
	| null
	| PricingRuleJsonValue[]
	| { [key: string]: PricingRuleJsonValue };
export type PricingRuleJsonObject = { [key: string]: PricingRuleJsonValue };

/**
 * One pricing rule. The `condition` + `effect` shapes vary per `ruleType` but
 * both are always JSON objects with at least the documented invariants:
 *   - `condition` may be `{}` (matches anything) but never `null`/array/scalar
 *   - `effect` always carries a non-empty string `type` discriminator field
 *
 * Per-type Zod schemas live at
 * `apps/api/src/modules/pricing-playbook/dto/pricing-rule-condition.types.ts`.
 */
export interface PricingRule {
	id: string;
	ruleType: PricingRuleType;
	condition: PricingRuleJsonObject;
	effect: PricingRuleJsonObject;
	priority: number;
	active: boolean;
	description: string;
	/**
	 * Free-text qualifier that captures conditions the structured `condition`
	 * enum can't express (e.g. "renovaties van woningen ouder dan 2 jaar",
	 * "opdrachten boven €5.000"). `null` when the structured `condition` is the
	 * complete match. When non-null, the quote pipeline asks the AI at quote
	 * time whether the narrative applies before committing the rule's effect.
	 */
	conditionNarrative: string | null;
	/** `true` once the owner has edited this rule in the review UI. Subsequent
	 * compile passes leave manually-overridden rules alone. */
	manualOverride: boolean;
	createdAt: string;
	updatedAt: string;
}

/**
 * The settings-page surface. `compiledAt` is `null` until the first compile pass
 * completes (empty playbook → no rules → no compile fires). `rulesCount` is the
 * count of `active` rules — useful for the page's at-a-glance status pill.
 */
export interface PricingPlaybook {
	playbookText: string;
	compiledAt: string | null;
	compiledHash: string | null;
	rulesCount: number;
	/** Compile-pass lifecycle — drives the "Bezig met verwerken / Verwerkt / Verwerken mislukt" UI. */
	compileStatus: PricingCompileStatus;
	updatedAt: string;
}

export interface UpdatePricingPlaybookInput {
	playbookText: string;
}

/** Hard upper bound on the playbook prose. Generous — typical playbooks are 1-5 kB;
 * cap at 32 kB so a runaway paste can't poison the compile prompt's token budget. */
export const PRICING_PLAYBOOK_TEXT_MAX_LENGTH = 32_000;

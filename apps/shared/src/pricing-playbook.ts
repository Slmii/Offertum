/**
 * Pricing-playbook wire types. The owner authors prose in `playbookText`; the
 * compile pass (Inngest function `pricing-playbook-compile`) turns it into typed
 * `PricingRule[]` rows the quote pipeline evaluates deterministically.
 *
 * Wire format conventions match the rest of the app: lowercase enum values
 * (Prisma stores UPPERCASE; mappers convert at the controller boundary).
 */

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
	/** Char offsets `{ start, end }` into the playbook prose that produced this
	 * rule. `null` when the rule was authored manually (no source sentence). */
	sourceSpan: { start: number; end: number } | null;
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
	updatedAt: string;
}

export interface UpdatePricingPlaybookInput {
	playbookText: string;
}

/** Hard upper bound on the playbook prose. Generous — typical playbooks are 1-5 kB;
 * cap at 32 kB so a runaway paste can't poison the compile prompt's token budget. */
export const PRICING_PLAYBOOK_TEXT_MAX_LENGTH = 32_000;

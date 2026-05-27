/**
 * Pure-function pricing rule engine (W11.5). Zero DI, zero network, zero Prisma —
 * fully unit-testable in milliseconds.
 *
 * Called by the quote pipeline (W11.6) with a context describing the opportunity
 * (or one specific line being priced) + the org's active `PricingRule` rows;
 * returns the subset of rules that match, deduplicated by `ruleType` with conflict
 * resolution applied (higher priority wins; manual overrides bump effective
 * priority; ties broken by older `createdAt`).
 *
 * Effect typing is intentionally loose here — the engine doesn't deeply validate
 * effects, the quote pipeline that consumes the output does. The engine's job is
 * conflict resolution + condition matching, not per-type interpretation.
 */

export interface PricingRuleEvaluationContext {
	/** Free-text category extracted from the opp (or the line being priced).
	 * Compared case-insensitively. `null` = no category info available. */
	category: string | null;
	/** Customer-signaled urgency. Matches the existing `Urgency` wire enum. */
	urgency: 'emergency' | 'high' | 'normal' | 'low' | null;
	/** Jurisdiction the rule applies in (NL / BE / DE / generic). */
	jurisdiction: string | null;
	/** Whether this evaluation is for a labor or material line. `null` = N/A
	 * (e.g. opp-wide rules like minimum order). */
	lineKind: 'labor' | 'material' | null;
}

export interface EvaluableRule {
	id: string;
	ruleType: string;
	condition: Record<string, unknown>;
	effect: Record<string, unknown>;
	priority: number;
	active: boolean;
	manualOverride: boolean;
	description: string;
	sourceSpan: { start: number; end: number } | null;
	createdAt: Date;
}

export interface AppliedRule {
	ruleId: string;
	ruleType: string;
	effect: Record<string, unknown>;
	description: string;
	sourceSpan: { start: number; end: number } | null;
}

/** Bumped priority addend for manually-overridden rules. Big enough that even a
 * priority-100 LLM-generated rule loses to a priority-0 manual override on the
 * same `(ruleType, condition)` slot. */
const MANUAL_OVERRIDE_PRIORITY_BUMP = 1_000;

/**
 * Match a rule's `condition` against the evaluation context. Missing keys in the
 * condition mean "matches anything" — so `condition = {}` always matches.
 * Present keys must equal the context value (case-insensitive for strings).
 */
function conditionMatches(condition: Record<string, unknown>, context: PricingRuleEvaluationContext): boolean {
	for (const [key, expected] of Object.entries(condition)) {
		if (expected === null || expected === undefined) {
			// Treat null/undefined in the condition as "key not specified".
			continue;
		}
		const actual = (context as unknown as Record<string, unknown>)[key];
		if (actual === null || actual === undefined) {
			// Context didn't supply this key but the rule requires it — no match.
			return false;
		}
		if (typeof expected === 'string' && typeof actual === 'string') {
			if (expected.toLowerCase() !== actual.toLowerCase()) {
				return false;
			}
		} else if (expected !== actual) {
			return false;
		}
	}
	return true;
}

function effectivePriority(rule: EvaluableRule): number {
	return rule.priority + (rule.manualOverride ? MANUAL_OVERRIDE_PRIORITY_BUMP : 0);
}

/**
 * "Specificity" of a rule's structured condition — number of constraining keys.
 * `{}` is 0 (matches anything). `{ category: "plumbing" }` is 1. `{ category:
 * "plumbing", lineKind: "labor" }` is 2. Used as a tiebreaker BEFORE
 * `createdAt` so more-specific rules win over less-specific ones when both
 * match a quote context at equal priority — the CSS-cascade pattern.
 *
 * Why this matters: the LLM compile pass tends to emit category-specific
 * hourly_rate rules at the same priority as the catch-all default ("€80/uur"
 * default + "€95/uur voor loodgieterswerk" — both priority 100). Without
 * specificity tiebreaking, the older catch-all wins and the specific rate is
 * silently ignored. Specificity flips the order without requiring the LLM to
 * encode the right priority manually.
 */
function conditionSpecificity(rule: EvaluableRule): number {
	return Object.keys(rule.condition).filter(key => {
		const value = rule.condition[key];
		return value !== null && value !== undefined;
	}).length;
}

/**
 * Conflict resolution for two rules of the same `ruleType` that both match the
 * context. Decision order:
 *   1. Higher effective priority wins (owner-set priority + manual-override bump)
 *   2. More-specific condition wins (more matched structured keys)
 *   3. Older `createdAt` wins (stable across re-evaluations)
 */
function chooseWinner(a: EvaluableRule, b: EvaluableRule): EvaluableRule {
	const priorityDelta = effectivePriority(b) - effectivePriority(a);
	if (priorityDelta !== 0) {
		return priorityDelta > 0 ? b : a;
	}
	const specificityDelta = conditionSpecificity(b) - conditionSpecificity(a);
	if (specificityDelta !== 0) {
		return specificityDelta > 0 ? b : a;
	}
	// Older row wins on full ties — stable across re-evaluations.
	return a.createdAt <= b.createdAt ? a : b;
}

/**
 * Evaluate the rule set against the context. Returns one AppliedRule per
 * matched `ruleType`. Inactive rules are filtered out before any matching happens.
 */
export function evaluateRules(
	rules: ReadonlyArray<EvaluableRule>,
	context: PricingRuleEvaluationContext
): AppliedRule[] {
	const winners = new Map<string, EvaluableRule>();

	for (const rule of rules) {
		if (!rule.active) {
			continue;
		}
		if (!conditionMatches(rule.condition, context)) {
			continue;
		}
		const incumbent = winners.get(rule.ruleType);
		if (!incumbent) {
			winners.set(rule.ruleType, rule);
			continue;
		}
		winners.set(rule.ruleType, chooseWinner(incumbent, rule));
	}

	return Array.from(winners.values()).map(rule => ({
		ruleId: rule.id,
		ruleType: rule.ruleType,
		effect: rule.effect,
		description: rule.description,
		sourceSpan: rule.sourceSpan
	}));
}

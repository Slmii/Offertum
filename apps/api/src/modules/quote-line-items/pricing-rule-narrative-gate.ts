/**
 * Pure gate between "loaded active rules" and "rules the engine may apply".
 *
 * A rule with no `conditionNarrative` is always eligible — the structured engine
 * decides it. A rule WITH a narrative is eligible only when the AI narrative verifier
 * confirmed it applies to this quote (its id is in `confirmedNarrativeRuleIds`).
 *
 * Fail-closed by construction: the caller passes an EMPTY set when verification was
 * skipped or errored, so an unverified narrative rule never reaches the engine — it
 * can't silently override the default pricing. Kept pure (no DI, no IO) so the
 * semantics are unit-testable in milliseconds, like the resolver.
 */
export interface NarrativeGateRule {
	id: string;
	conditionNarrative: string | null;
}

export function selectRulesPassingNarrativeGate<T extends NarrativeGateRule>(
	rules: readonly T[],
	confirmedNarrativeRuleIds: ReadonlySet<string>
): T[] {
	return rules.filter(rule => !hasNarrative(rule) || confirmedNarrativeRuleIds.has(rule.id));
}

/** A narrative is "present" only when it's a non-empty, non-whitespace string. */
export function hasNarrative(rule: NarrativeGateRule): boolean {
	return typeof rule.conditionNarrative === 'string' && rule.conditionNarrative.trim().length > 0;
}

/**
 * Reduce the AI verifier's verdicts to the set of confirmed rule ids, fail-closed against
 * malformed output. A ref is confirmed ONLY when it carries exactly one verdict and that
 * verdict is `applies: true`. Conflicting or duplicate verdicts (`R2=false, R2=true`),
 * missing verdicts, and unknown refs all resolve to "not confirmed" — so an ambiguous
 * response can never let a narrative rule slip through.
 */
export function resolveConfirmedNarrativeRuleIds(
	refToRuleId: ReadonlyMap<string, string>,
	verdicts: readonly { ref: string; applies: boolean }[]
): Set<string> {
	const verdictsByRef = new Map<string, boolean[]>();
	for (const verdict of verdicts) {
		if (!refToRuleId.has(verdict.ref)) {
			// Unknown ref the model invented — ignore it.
			continue;
		}
		const existing = verdictsByRef.get(verdict.ref) ?? [];
		existing.push(verdict.applies);
		verdictsByRef.set(verdict.ref, existing);
	}

	const confirmed = new Set<string>();
	for (const [ref, ruleId] of refToRuleId) {
		const refVerdicts = verdictsByRef.get(ref);
		if (refVerdicts && refVerdicts.length === 1 && refVerdicts[0] === true) {
			confirmed.add(ruleId);
		}
	}
	return confirmed;
}

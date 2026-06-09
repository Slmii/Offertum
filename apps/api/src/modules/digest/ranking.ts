import { MS_PER_DAY } from '@/lib/time/duration';

export interface RankableOpportunity {
	opportunityId: string;
	customerName: string | null;
	requestType: string;
	// Net euro value of the latest quote draft (0 when none) — see quote-value.ts.
	quoteNetEuros: number;
	// Hours between opp creation and our first sent reply; null when we never replied.
	firstResponseHours: number | null;
	priorCheckInCount: number;
	validUntil: Date | null;
	customerDeadline: Date | null;
}

export interface RankingConfig {
	// Resolved org win-probability baseline (see win-baseline.ts). Source-agnostic:
	// the ranking does not know it came from history + trade prior.
	winBaseline: number;
	// Passed through from org config; reserved for follow-up-due time pressure (Phase B+).
	followUpCadenceDays: number;
}

export interface RankedOpportunity extends RankableOpportunity {
	rank: number;
	priority: number;
	winProbability: number;
	expectedValueEuros: number;
	timePressure: number;
}

const WIN_PROB_MIN = 0.02;
const WIN_PROB_MAX = 0.95;
// Floor so a €0 (no-quote) opp still carries a value term and can rank on urgency.
const VALUE_FLOOR_EUROS = 50;

// Faster first response → higher win odds. Piecewise on hours-to-first-reply.
function responseTimeModifier(hours: number | null): number {
	// never replied yet
	if (hours === null) {
		return 0.7;
	}

	if (hours <= 1) {
		return 1.4;
	}

	if (hours <= 4) {
		return 1.2;
	}

	if (hours <= 24) {
		return 1.0;
	}

	if (hours <= 72) {
		return 0.85;
	}

	return 0.7;
}

// Each unanswered follow-up decays the odds: silence after nudging is a bad sign.
function followUpCountModifier(priorCheckInCount: number): number {
	if (priorCheckInCount <= 0) {
		return 1.0;
	}

	if (priorCheckInCount === 1) {
		return 0.6;
	}

	return 0.35;
}

// Rises as the soonest relevant deadline approaches. Uses the nearest of validUntil /
// customerDeadline; opps with no date carry the neutral 1.0.
function computeTimePressure(opp: RankableOpportunity, now: Date): number {
	const dates = [opp.validUntil, opp.customerDeadline].filter((d): d is Date => d !== null);
	if (dates.length === 0) {
		return 1.0;
	}

	const soonest = Math.min(...dates.map(d => d.getTime()));
	const days = (soonest - now.getTime()) / MS_PER_DAY;
	if (days <= 2) {
		return 2.0;
	}

	if (days <= 5) {
		return 1.5;
	}

	if (days <= 14) {
		return 1.1;
	}

	return 1.0;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

/**
 * Score open opportunities by `priority = max(quoteNetEuros, VALUE_FLOOR_EUROS) × winProbability × timePressure`. Pure +
 * deterministic — same inputs always produce the same ordering. Ties break on
 * opportunityId for a stable sort.
 */
export function rankOpportunities(
	opps: readonly RankableOpportunity[],
	cfg: RankingConfig,
	now: Date = new Date()
): RankedOpportunity[] {
	const scored = opps.map(opp => {
		const winProbability = clamp(
			cfg.winBaseline *
				responseTimeModifier(opp.firstResponseHours) *
				followUpCountModifier(opp.priorCheckInCount),
			WIN_PROB_MIN,
			WIN_PROB_MAX
		);

		const expectedValueEuros = Math.max(opp.quoteNetEuros, VALUE_FLOOR_EUROS) * winProbability;
		const pressure = computeTimePressure(opp, now);
		const priority = expectedValueEuros * pressure;

		return { ...opp, winProbability, expectedValueEuros, timePressure: pressure, priority, rank: 0 };
	});

	return scored
		.sort((a, b) => b.priority - a.priority || a.opportunityId.localeCompare(b.opportunityId))
		.map((s, i) => ({ ...s, rank: i + 1 }));
}

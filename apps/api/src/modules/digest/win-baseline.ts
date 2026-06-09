// Pseudo-count for Bayesian shrinkage toward the trade prior. Interpreted as "the
// prior is worth this many observed closed deals." 8 = the prior dominates until the
// org has ~8 closed deals, then the org's own rate takes over smoothly. No hard cliff.
const PRIOR_PSEUDO_COUNT = 8;

export interface WinBaselineInput {
	wonCount: number;
	lostCount: number;
	// The trade prior (VERTICAL_WIN_BASELINE[vertical]) — the shrinkage target.
	tradePrior: number;
}

/**
 * Org win-probability baseline, blending the org's own WON/LOST history with the trade
 * prior via Bayesian shrinkage: (wins + k·prior) / (wins + losses + k). With no closed
 * deals it returns the prior exactly; as the sample grows it converges to the org's
 * true win rate. Self-correcting, so the (unsourced) trade priors fade away with use.
 */
export function resolveWinBaseline({ wonCount, lostCount, tradePrior }: WinBaselineInput): number {
	const k = PRIOR_PSEUDO_COUNT;
	return (wonCount + k * tradePrior) / (wonCount + lostCount + k);
}

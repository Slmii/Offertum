import type { Vertical } from '@/generated/prisma/enums';

/**
 * Coarse win-probability priors per trade, used as the BASE term of winProbability in
 * the ranking engine. Deliberately approximate — the ranking's value is the relative
 * ordering WITHIN an org, which the response-time + follow-up modifiers drive far more
 * than this prior. Natural seam to replace with org-history-derived baselines post-MVP.
 */
export const VERTICAL_WIN_BASELINE: Record<Vertical, number> = {
	LOODGIETER: 0.39,
	ELEKTRICIEN: 0.36,
	SCHILDER: 0.24,
	TIMMERMAN: 0.31,
	DAKDEKKER: 0.23,
	TEGELZETTER: 0.27,
	HOVENIER: 0.29,
	INSTALLATEUR: 0.34,
	SCHOONMAAK: 0.41,
	OVERIG: 0.3
};

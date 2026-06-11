import { MS_PER_DAY } from '@/lib/time/duration';

// Minimum non-dismissed opportunities an org needs before any insight banner shows.
// Below this, the metrics are too noisy to be trustworthy.
export const MIN_OPPORTUNITIES_FOR_PATTERNS = 10;

// How long a dismissed banner stays hidden before it re-surfaces.
export const PATTERN_RESHOW_DAYS = 30;

/**
 * Pure visibility gate for a dashboard insight banner. A banner is visible when the org
 * has crossed the opportunity threshold AND the user hasn't dismissed it within the
 * re-show window. `now` is injectable for deterministic tests.
 */
export function isPatternVisible(
	input: { totalOpportunities: number; dismissedAt: Date | null },
	now: Date = new Date()
): boolean {
	if (input.totalOpportunities < MIN_OPPORTUNITIES_FOR_PATTERNS) {
		return false;
	}
	if (input.dismissedAt === null) {
		return true;
	}
	return now.getTime() - input.dismissedAt.getTime() >= PATTERN_RESHOW_DAYS * MS_PER_DAY;
}

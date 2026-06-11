import { describe, expect, it } from '@jest/globals';

import { isPatternVisible, MIN_OPPORTUNITIES_FOR_PATTERNS, PATTERN_RESHOW_DAYS } from './pattern-visibility';

const NOW = new Date('2026-06-09T00:00:00.000Z');

describe('isPatternVisible', () => {
	it('hidden below the opportunity threshold', () => {
		expect(
			isPatternVisible({ totalOpportunities: MIN_OPPORTUNITIES_FOR_PATTERNS - 1, dismissedAt: null }, NOW)
		).toBe(false);
	});
	it('visible at/above threshold with no dismissal', () => {
		expect(isPatternVisible({ totalOpportunities: 10, dismissedAt: null }, NOW)).toBe(true);
	});
	it('hidden within the re-show window after dismissal', () => {
		const recent = new Date(NOW.getTime() - (PATTERN_RESHOW_DAYS - 1) * 86_400_000);
		expect(isPatternVisible({ totalOpportunities: 10, dismissedAt: recent }, NOW)).toBe(false);
	});
	it('re-shows after the window elapses', () => {
		const old = new Date(NOW.getTime() - (PATTERN_RESHOW_DAYS + 1) * 86_400_000);
		expect(isPatternVisible({ totalOpportunities: 10, dismissedAt: old }, NOW)).toBe(true);
	});
});

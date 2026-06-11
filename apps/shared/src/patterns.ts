export const PATTERN_KEYS = ['reply_speed', 'win_rate_by_speed'] as const;
export type PatternKey = (typeof PATTERN_KEYS)[number];

export interface PatternBanner {
	patternKey: PatternKey;
	headline: string;
	detail: string;
}

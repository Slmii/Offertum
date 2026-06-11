// Stable banner identities. Persisted verbatim in `PatternDismissal.patternKey`, so
// renaming one is a data migration — keep them stable.
// `PatternKey` and `PatternBanner` are the canonical wire types from `@offertum/shared`.
// Re-exported here so local imports don't need to change.
export type { PatternBanner, PatternKey } from '@offertum/shared';

// Won/lost tally inside a single first-response-time bucket.
export interface BucketStat {
	wonCount: number;
	lostCount: number;
}

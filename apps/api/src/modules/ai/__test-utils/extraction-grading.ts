/**
 * Field comparison shared by the live accuracy harnesses (`extractor.accuracy.spec.ts` and
 * `attachments.accuracy.spec.ts`), so a value judged correct in one is judged the same way in
 * the other.
 */

const MIN_SHARED_CHARS = 5;
const MIN_SHARED_RATIO = 0.6;

const tokenize = (value: string): string[] =>
	value
		.toLowerCase()
		.replace(/[^a-z0-9À-ſ\s]/g, ' ')
		.split(/\s+/)
		.filter(token => token.length >= 3);

function longestCommonSubstring(a: string, b: string): number {
	let best = 0;
	const previous = new Array<number>(b.length + 1).fill(0);
	for (let i = 1; i <= a.length; i++) {
		let diagonal = 0;
		for (let j = 1; j <= b.length; j++) {
			const above = previous[j]!;
			previous[j] = a[i - 1] === b[j - 1] ? diagonal + 1 : 0;
			best = Math.max(best, previous[j]!);
			diagonal = above;
		}
	}
	return best;
}

/**
 * Do two tokens mean the same word? Exact match, or a shared run of characters long enough to
 * be the same stem. Dutch glues words together, so an exact token match called
 * "Badkamerrenovatie" and "Renovatie badkamer" different — five of the extractor's twelve
 * "misses" were that and nothing else. The shared run must be at least 5 characters AND most of
 * the shorter token, which keeps "tuin" (in both "tuininrichting" and "achtertuin") from
 * matching on its own while "inricht" does.
 */
function tokensMatch(expected: string, actual: string): boolean {
	if (expected === actual) {
		return true;
	}
	const shared = longestCommonSubstring(expected, actual);
	return shared >= MIN_SHARED_CHARS && shared / Math.min(expected.length, actual.length) >= MIN_SHARED_RATIO;
}

/** ≥50% of the expected tokens are matched by some actual token; or both null. */
export function fuzzyMatch(actual: string | null, expected: string | null): boolean {
	if (actual === null || expected === null) {
		return actual === expected;
	}
	const actualTokens = tokenize(actual);
	const expectedTokens = tokenize(expected);
	if (expectedTokens.length === 0) {
		// Expected was punctuation-only or all short words; accept a similarly minimal actual.
		return actual.trim().length === 0 || actual === expected;
	}
	const hits = expectedTokens.filter(e => actualTokens.some(a => tokensMatch(e, a))).length;
	return hits / expectedTokens.length >= 0.5;
}

/** ±2 days, or both null. */
export function dateMatch(actual: string | null, expected: string | null): boolean {
	if (actual === null || expected === null) {
		return actual === expected;
	}
	const diffMs = Math.abs(Date.parse(actual) - Date.parse(expected));
	return !Number.isNaN(diffMs) && diffMs / 86_400_000 <= 2;
}

/**
 * ≥50% of expected hints are matched (substring, either direction) by some extracted hint.
 * Lenient on purpose — phrasings vary.
 */
export function hintsMatch(actual: string[], expected: string[]): boolean {
	if (expected.length === 0) {
		return true;
	}
	const lowerActual = actual.map(hint => hint.toLowerCase());
	const hits = expected.filter(e => {
		const needle = e.toLowerCase();
		return lowerActual.some(a => a.includes(needle) || needle.includes(a));
	}).length;
	return hits / expected.length >= 0.5;
}

/**
 * Count-aware word/phrase selection. Returns `singular` when `count === 1`, otherwise `plural`
 * (so `0` and `2+` both take the plural, as Dutch and English expect).
 *
 * Used for UI + email copy where the noun — or a noun+verb phrase — changes with the count:
 *   `${n} ${pluralize(n, 'regel', 'regels')}`            → "1 regel" / "3 regels"
 *   `${n} ${pluralize(n, 'regel heeft', 'regels hebben')}` → "1 regel heeft" / "3 regels hebben"
 *
 * The caller renders the count itself; this only picks the word/phrase.
 */
export function pluralize(count: number, singular: string, plural: string): string {
	return count === 1 ? singular : plural;
}

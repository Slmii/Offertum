import { dateMatch, fuzzyMatch, hintsMatch } from '@/modules/ai/__test-utils/extraction-grading';

describe('fuzzyMatch', () => {
	// The five real "misses" from the 2026-09-20 extractor run — all wording, none wrong.
	it.each([
		['Renovatie badkamer', 'Badkamerrenovatie'],
		['Achtertuin opnieuw inrichten', 'Tuininrichting'],
		['Brochure drukwerk', 'Brochures drukken'],
		['Dakrenovatie', 'dakrenovatie'],
		['Buitenschilderwerk woning', 'schilderwerk']
	])('accepts %s for %s', (actual, expected) => {
		expect(fuzzyMatch(actual, expected)).toBe(true);
	});

	it.each([
		['Onderhoud airco', 'Dakrenovatie'],
		['Achtertuin', 'Tuinhuis plaatsen'],
		['Offerte', 'Warmtepomp installatie']
	])('still rejects %s for %s', (actual, expected) => {
		expect(fuzzyMatch(actual, expected)).toBe(false);
	});

	it('treats null strictly', () => {
		expect(fuzzyMatch(null, null)).toBe(true);
		expect(fuzzyMatch(null, 'Kerkstraat 12')).toBe(false);
		expect(fuzzyMatch('Kerkstraat 12', null)).toBe(false);
	});
});

describe('dateMatch', () => {
	it('allows ±2 days and nothing more', () => {
		expect(dateMatch('2026-05-24', '2026-05-22')).toBe(true);
		expect(dateMatch('2026-05-29', '2026-05-22')).toBe(false);
		expect(dateMatch(null, null)).toBe(true);
		expect(dateMatch(null, '2026-05-22')).toBe(false);
	});
});

describe('hintsMatch', () => {
	it('needs half of the expected hints, substring either way', () => {
		expect(hintsMatch(['120 m2 keramische dakpannen'], ['120 m2', 'isolatie'])).toBe(true);
		expect(hintsMatch(['nieuwe wastafel'], ['lekkage badkamer', 'aansluiting wastafel', 'nieuwe wastafel', 'vervanging'])).toBe(false);
		expect(hintsMatch([], [])).toBe(true);
	});
});

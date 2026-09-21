import { buildReferenceCalendarNL } from '@/modules/ai/extractor/prompts/reference-calendar.nl';

describe('buildReferenceCalendarNL', () => {
	// The regression: 2026-05-16 is a SATURDAY. "Eind volgende week" is Friday 22 May — the
	// model, left to work out the weekday itself, started answering 29 May.
	it('resolves the weeks around a Saturday reference date', () => {
		const calendar = buildReferenceCalendarNL('2026-05-16');

		expect(calendar).toContain('Referentiedatum (vandaag): zaterdag 16 mei 2026 = 2026-05-16.');
		expect(calendar).toContain(
			'- Deze week: maandag 11 mei 2026 = 2026-05-11 t/m zondag 17 mei 2026 = 2026-05-17.'
		);
		expect(calendar).toContain(
			'- Volgende week: maandag 18 mei 2026 = 2026-05-18 t/m zondag 24 mei 2026 = 2026-05-24. De vrijdag van die week is 2026-05-22.'
		);
		expect(calendar).toContain('De week daarna: maandag 25 mei 2026 = 2026-05-25');
	});

	it('treats Sunday as the END of the week, not the start', () => {
		const calendar = buildReferenceCalendarNL('2026-05-17');

		expect(calendar).toContain('- Deze week: maandag 11 mei 2026');
		expect(calendar).toContain('- Volgende week: maandag 18 mei 2026');
	});

	it('handles a Monday reference date', () => {
		expect(buildReferenceCalendarNL('2026-05-18')).toContain('- Deze week: maandag 18 mei 2026 = 2026-05-18');
	});

	it('gets month ends right across a year boundary and a leap year', () => {
		expect(buildReferenceCalendarNL('2026-12-10')).toContain(
			'Einde van deze maand: 2026-12-31. Einde van volgende maand: 2027-01-31.'
		);
		expect(buildReferenceCalendarNL('2028-01-20')).toContain('Einde van volgende maand: 2028-02-29.');
	});

	it('lists the coming days with their weekday so "aanstaande donderdag" is a lookup', () => {
		const calendar = buildReferenceCalendarNL('2026-05-16');

		expect(calendar).toContain('  donderdag 21 mei 2026 = 2026-05-21');
		expect(calendar).toContain('  zaterdag 6 juni 2026 = 2026-06-06');
		expect(calendar).not.toContain('2026-06-07');
	});

	it('is not thrown off by DST changeover dates', () => {
		// Last Sunday of March: clocks move in NL. Arithmetic is on UTC calendar dates.
		expect(buildReferenceCalendarNL('2026-03-28')).toContain('  zondag 29 maart 2026 = 2026-03-29');
		expect(buildReferenceCalendarNL('2026-03-28')).toContain('  maandag 30 maart 2026 = 2026-03-30');
	});

	it('degrades gracefully on a malformed date', () => {
		expect(buildReferenceCalendarNL('geen-datum')).toBe('Referentiedatum: geen-datum.');
	});

	it('computes the next working day, skipping the weekend', () => {
		// Saturday → Monday, Friday → Monday, Tuesday → Wednesday.
		expect(buildReferenceCalendarNL('2026-05-16')).toContain(
			'Eerstvolgende werkdag na vandaag: maandag 18 mei 2026 = 2026-05-18.'
		);
		expect(buildReferenceCalendarNL('2026-05-15')).toContain(
			'Eerstvolgende werkdag na vandaag: maandag 18 mei 2026 = 2026-05-18.'
		);
		expect(buildReferenceCalendarNL('2026-05-19')).toContain(
			'Eerstvolgende werkdag na vandaag: woensdag 20 mei 2026 = 2026-05-20.'
		);
	});
});

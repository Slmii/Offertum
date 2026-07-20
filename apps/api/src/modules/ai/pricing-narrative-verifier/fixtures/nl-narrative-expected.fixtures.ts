import type {
	PricingNarrativeQuoteContext,
	PricingNarrativeRule
} from '@/modules/ai/pricing-narrative-verifier/pricing-narrative-verifier.types';

/**
 * Hand-curated corpus for the quote-time "AI controleert" narrative verifier. Each fixture is a
 * quote context (the customer's request) + one or more narrative-gated rules, plus the verdict we
 * expect per rule (`ref → applies`). Consumed by `pricing-narrative-verifier.accuracy.spec.ts`
 * (live-API, skipped without OPENAI_API_KEY), feeding the shared `.ai-reports` HTML.
 *
 * The corpus deliberately covers all three behaviours that matter:
 *  - **Evidence present** → `true` (the request clearly satisfies the narrative).
 *  - **Evidence absent / contradicted** → `false` (fail-closed: don't apply an exception you can't
 *    justify from the request).
 *  - **Mixed** — two rules against one request where exactly one applies.
 */
export interface NarrativeFixture {
	name: string;
	context: PricingNarrativeQuoteContext;
	rules: PricingNarrativeRule[];
	/** Expected verdict per rule ref. */
	expected: Record<string, boolean>;
}

export const NL_NARRATIVE_FIXTURES: NarrativeFixture[] = [
	{
		name: 'Renovatie — leeftijd blijkt uit de aanvraag',
		context: {
			requestType: 'Badkamer renoveren',
			deliverableHints: ['badkamer', 'tegels'],
			bodyText:
				'Hallo, wij willen graag onze badkamer laten renoveren. Het gaat om onze woning uit 1968, dus alles is flink gedateerd. Kunnen jullie een offerte maken?',
			customerName: 'Jan de Vries',
			customerEmail: 'jan.devries@gmail.com',
			address: null
		},
		rules: [
			{ ref: 'R1', description: '9% BTW op arbeid', narrative: 'Alleen voor renovaties van woningen ouder dan 2 jaar.' }
		],
		expected: { R1: true }
	},
	{
		name: 'Nieuwbouw — narrative niet te bevestigen (fail-closed)',
		context: {
			requestType: 'Badkamer afwerken',
			deliverableHints: ['badkamer'],
			bodyText:
				'Wij hebben een nieuwbouwwoning die dit jaar is opgeleverd en willen graag de badkamer laten afwerken.',
			customerName: 'Sophie Bakker',
			customerEmail: 'sophie@outlook.com',
			address: null
		},
		rules: [
			{ ref: 'R1', description: '9% BTW op arbeid', narrative: 'Alleen voor renovaties van woningen ouder dan 2 jaar.' }
		],
		expected: { R1: false }
	},
	{
		name: 'Projectdrempel — budget boven € 5.000',
		context: {
			requestType: 'Verbouwing benedenverdieping',
			deliverableHints: ['verbouwing'],
			bodyText: 'We willen onze hele benedenverdieping verbouwen. Het budget ligt rond de € 15.000.',
			customerName: 'Familie Jansen',
			customerEmail: 'jansen@gmail.com',
			address: null
		},
		rules: [
			{ ref: 'R1', description: '5% korting bij vooruitbetaling', narrative: 'Alleen voor projecten boven de € 5.000.' }
		],
		expected: { R1: true }
	},
	{
		name: 'Projectdrempel — klein klusje eronder',
		context: {
			requestType: 'Kraan vervangen',
			deliverableHints: ['kraan'],
			bodyText: 'Klein klusje: een lekkende kraan in de keuken vervangen. Denk aan een uurtje werk.',
			customerName: 'Peter Smit',
			customerEmail: 'p.smit@gmail.com',
			address: null
		},
		rules: [
			{ ref: 'R1', description: '5% korting bij vooruitbetaling', narrative: 'Alleen voor projecten boven de € 5.000.' }
		],
		expected: { R1: false }
	},
	{
		name: 'België — blijkt uit adres + e-mail',
		context: {
			requestType: 'Loodgieterswerk onderaanneming',
			deliverableHints: ['loodgieterswerk'],
			bodyText:
				'Goeiedag, wij zijn een aannemer uit Antwerpen en zoeken een onderaannemer voor loodgieterswerk op een project hier in de buurt.',
			customerName: 'Bouwbedrijf Peeters',
			customerEmail: 'info@bouwbedrijf-peeters.be',
			address: 'Antwerpen, België'
		},
		rules: [{ ref: 'R1', description: 'BTW verlegd', narrative: 'Alleen voor zakelijke klanten in België.' }],
		expected: { R1: true }
	},
	{
		name: 'Gemengd — oude woning (waar) maar klein project (niet waar)',
		context: {
			requestType: 'Meterkast vernieuwen',
			deliverableHints: ['meterkast', 'elektra'],
			bodyText:
				'Onze woning is uit 1975 en we willen de meterkast laten vernieuwen. Het is een klein project, ongeveer € 900.',
			customerName: 'Karel Dubois',
			customerEmail: 'karel@gmail.com',
			address: null
		},
		rules: [
			{ ref: 'R1', description: '9% BTW op arbeid', narrative: 'Alleen voor woningen ouder dan 2 jaar.' },
			{ ref: 'R2', description: '5% projectkorting', narrative: 'Alleen voor projecten boven de € 5.000.' }
		],
		expected: { R1: true, R2: false }
	},
	{
		name: 'Reiskosten — geografische conditie (job in Emmen, buiten Utrecht)',
		context: {
			requestType: 'Buitenkraan plaatsen',
			deliverableHints: ['kraan', 'waterafvoer'],
			bodyText:
				'Hallo, ik wil graag een kraan geplaatst hebben in de tuin, in de veranda. Er zit waterafvoer aan de andere kant van de muur (keuken), dus daar zou het water vandaan gehaald kunnen worden. Adres: Tammingecamp 22, Emmen. Zou het woensdag kunnen?',
			customerName: 'Berkay Yıldız',
			customerEmail: 'b.yildiz@westerhuis.nl',
			address: 'Tammingecamp 22, Emmen'
		},
		rules: [
			// Emmen is NOT Utrecht → the "binnen Utrecht" fee must NOT apply, the "buiten Utrecht" one must.
			{ ref: 'R1', description: 'Voorrijkosten binnen Utrecht-stad: € 35', narrative: 'Alleen binnen de stad Utrecht.' },
			{
				ref: 'R2',
				description: 'Voorrijkosten buiten Utrecht-stad: € 0,50/km',
				narrative: 'Alleen buiten de stad Utrecht.'
			}
		],
		expected: { R1: false, R2: true }
	}
];

/** Verdict-level gate: ≥80% of individual rule verdicts correct across the corpus. */
export const MIN_NARRATIVE_ACCURACY = 0.8;

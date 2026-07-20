import type { PricingEffectType, PricingRuleType } from '@offertum/shared';

/**
 * Hand-curated Dutch corpus for the pricing-playbook compile pass. Each fixture is a prose
 * playbook + the rules we expect the compiler to emit. Consumed by `compile.accuracy.spec.ts`
 * (live-API harness, skipped without OPENAI_API_KEY) which feeds the shared `.ai-reports` HTML.
 *
 * Grading is intentionally coarse: we check that each expected rule shows up with the right
 * `ruleType` + effect value, and — critically for the "AI controleert" feature — that
 * conditions the structured enum can't express land in `conditionNarrative` (and ones that CAN
 * do NOT). Exact urgency-tier judgement ("zelfde dag" → emergency vs high) is model-dependent, so
 * `urgency` is only asserted where the prose is unambiguous.
 */
export interface ExpectedCompileRule {
	ruleType: PricingRuleType;
	effectType: PricingEffectType;
	/** Expected numeric effect value (rate, percentage, euros). Matched within ±0.01. */
	value: number;
	/** Whether we expect `conditionNarrative` to be non-null (a qualifier the 4 structured
	 * fields can't express — the thing the quote-time AI verifier checks). **Optional**: only
	 * assert it where the split is unambiguous — `true` for a qualifier no structured field can
	 * hold (renovation age, city zone, order threshold), `false` for the default rule in an
	 * exception pair (which must stay unconditional). Leave it UNSET for borderline cases where a
	 * redundant narrative is model-dependent (e.g. a narrative echoing an already-structured
	 * `urgency` tier) so the corpus doesn't fail on a soft over-emission. */
	hasNarrative?: boolean;
	/** Only asserted when the prose pins an unambiguous urgency tier. */
	urgency?: 'emergency' | 'high' | 'normal' | 'low';
	/**
	 * Acceptable `condition.jurisdiction` values (lenient set, like {@link urgency}). Asserted only
	 * when set. For a domestic rule whose prose names no country, BOTH `null` (applies everywhere)
	 * and `'NL'` are fine — the resolver pins the quote to NL, so either matches; a wrong country
	 * (`'BE'`/`'DE'`) would make the rule silently never fire (the per-km travel regression). Set on
	 * TRAVEL rules to guard exactly that. Leave unset where jurisdiction is irrelevant/model-dependent.
	 */
	jurisdiction?: ReadonlyArray<'NL' | 'BE' | 'DE' | null>;
}

/** A domestic (country-less prose) rule may compile to NL or stay unscoped — both work with the
 * NL-pinned resolver. Guards against a stray `'BE'`/`'DE'` that would break matching. */
const NL_OR_UNSCOPED: ReadonlyArray<'NL' | 'BE' | 'DE' | null> = ['NL', null];

export interface CompileFixture {
	name: string;
	prose: string;
	/** Empty array = we expect the compiler to find NO rules (the "Geen prijsregels gevonden" case). */
	expected: ExpectedCompileRule[];
}

const r = (
	ruleType: PricingRuleType,
	effectType: PricingEffectType,
	value: number,
	hasNarrative?: boolean,
	urgency?: ExpectedCompileRule['urgency']
): ExpectedCompileRule => ({ ruleType, effectType, value, hasNarrative, urgency });

export const NL_COMPILE_FIXTURES: CompileFixture[] = [
	{
		name: 'Generieke MKB — alle regeltypes',
		prose: [
			'Standaard uurtarief is € 85 per uur. Voor loodgieterswerk reken ik € 95 per uur.',
			'BTW altijd 21%.',
			'Materialen reken ik door tegen inkoopprijs + 15% opslag.',
			'Voorrijkosten zijn € 25 binnen de stad, € 0,55 per kilometer daarbuiten.',
			'Spoed binnen 24 uur is +25%. Spoed zelfde dag is +50%.',
			'Minimumorder € 150 voor losse klusjes.'
		].join('\n'),
		expected: [
			r('hourly_rate', 'rate_eur_per_hour', 85),
			r('hourly_rate', 'rate_eur_per_hour', 95),
			r('vat', 'vat_rate', 21),
			r('material_markup', 'markup_percent', 15),
			// "binnen de stad" / "buiten de stad" — no structured location field → narrative.
			{ ...r('travel', 'flat_fee_eur', 25, true), jurisdiction: NL_OR_UNSCOPED },
			{ ...r('travel', 'per_km_eur', 0.55, true), jurisdiction: NL_OR_UNSCOPED },
			r('urgency', 'surcharge_percent', 25),
			r('urgency', 'surcharge_percent', 50),
			// "voor losse klusjes" gates the minimum → narrative.
			r('minimum_order', 'minimum_eur', 150, true)
		]
	},
	{
		name: 'Loodgieter / installateur',
		prose: [
			'Uurtarief € 85 voor loodgieterswerk.',
			'Voorrijkosten € 30 binnen Amsterdam, daarbuiten € 0,55 per kilometer.',
			'Spoed binnen 4 uur is +50%.',
			'Materialen reken ik door tegen inkoop + 15%.'
		].join('\n'),
		expected: [
			r('hourly_rate', 'rate_eur_per_hour', 85),
			{ ...r('travel', 'flat_fee_eur', 30), jurisdiction: NL_OR_UNSCOPED },
			{ ...r('travel', 'per_km_eur', 0.55), jurisdiction: NL_OR_UNSCOPED },
			r('urgency', 'surcharge_percent', 50),
			r('material_markup', 'markup_percent', 15)
		]
	},
	{
		name: 'Elektricien',
		prose: [
			'€ 95 per uur voor regulier werk, € 120 per uur voor werk in de meterkast.',
			'BTW 21%.',
			'Minimumtarief € 95, ook bij kortere bezoeken.'
		].join('\n'),
		expected: [
			r('hourly_rate', 'rate_eur_per_hour', 95),
			// "werk in de meterkast" is a location qualifier, no structured field → narrative.
			r('hourly_rate', 'rate_eur_per_hour', 120, true),
			r('vat', 'vat_rate', 21),
			// Minimum's narrative is model-dependent ("ook bij kortere bezoeken") — leave it unset.
			r('minimum_order', 'minimum_eur', 95)
		]
	},
	{
		name: 'Consultancy / dienstverlener',
		prose: [
			'Mijn uurtarief is € 95 voor consultancy en € 65 voor administratieve werkzaamheden.',
			'Bij opdrachten van meer dan 40 uur geef ik 10% korting.',
			'BTW 21%.'
		].join('\n'),
		expected: [
			r('hourly_rate', 'rate_eur_per_hour', 95),
			r('hourly_rate', 'rate_eur_per_hour', 65),
			// "meer dan 40 uur" is a volume threshold → narrative.
			r('discount', 'discount_percent', 10, true),
			r('vat', 'vat_rate', 21)
		]
	},
	{
		name: 'Alleen BTW',
		prose: 'BTW is altijd 21%.',
		expected: [r('vat', 'vat_rate', 21)]
	},
	{
		name: 'BTW-split arbeid vs materiaal',
		prose: 'BTW: 9% op arbeid, 21% op materialen.',
		expected: [
			// lineKind ('labor' / 'material') is a structured field → no narrative expected.
			r('vat', 'vat_rate', 9, false),
			r('vat', 'vat_rate', 21, false)
		]
	},
	{
		name: 'Spoedtoeslag — twee tiers',
		prose: 'Spoed binnen 24 uur reken ik 25% extra. Spoed binnen 4 uur reken ik 75% extra.',
		// Both fit the structured urgency enum, but which tier ("binnen 24u" → high vs emergency) is
		// model judgement — assert the two surcharge values, not the exact tier.
		expected: [r('urgency', 'surcharge_percent', 25), r('urgency', 'surcharge_percent', 75)]
	},
	{
		name: 'Spoedtoeslag — expliciete tier',
		prose: 'Voor spoedklussen die dezelfde dag af moeten reken ik 50% toeslag.',
		// "zelfde dag" is fully captured by `urgency: emergency`, so the prompt's "dubbel NOOIT een
		// structured field in de narrative" rule requires `conditionNarrative: null`. Asserting both
		// guards against the redundant-narrative over-emission regressing.
		expected: [r('urgency', 'surcharge_percent', 50, false, 'emergency')]
	},
	{
		name: 'Reiskosten met gratis-zone',
		prose: 'Reiskosten zijn € 0,50 per kilometer, maar gratis binnen 15 kilometer.',
		// The "gratis binnen 15 km" is the structured `freeUnderKm` field — no narrative expected.
		expected: [{ ...r('travel', 'per_km_eur', 0.5, false), jurisdiction: NL_OR_UNSCOPED }]
	},
	{
		name: 'Meerdere kortingen (beide narrative)',
		prose: 'Ik geef 5% korting bij vooruitbetaling. Terugkerende klanten krijgen 10% korting.',
		expected: [
			// "bij vooruitbetaling" (payment condition) + "terugkerende klanten" (tenure) → both narrative.
			r('discount', 'discount_percent', 5, true),
			r('discount', 'discount_percent', 10, true)
		]
	},
	{
		name: 'BTW-uitzondering met narrative (renovatie)',
		prose: 'BTW is 21%, behalve voor renovaties van woningen ouder dan 2 jaar — daar reken ik 9%.',
		expected: [
			r('vat', 'vat_rate', 21, false),
			// "ouder dan 2 jaar" can't be a structured field → conditionNarrative.
			r('vat', 'vat_rate', 9, true)
		]
	},
	{
		name: 'Korting met drempel (narrative)',
		prose: 'Ik geef 5% korting bij vooruitbetaling, maar alleen voor projecten boven de € 5.000.',
		expected: [r('discount', 'discount_percent', 5, true)]
	},
	{
		name: 'Materiaalopslag-uitzondering (narrative)',
		prose: 'Materialen reken ik door met 15% opslag, behalve bij monumentale panden — daar reken ik geen opslag.',
		expected: [
			r('material_markup', 'markup_percent', 15, false),
			// "monumentale panden" is a property qualifier → narrative.
			r('material_markup', 'markup_percent', 0, true)
		]
	},
	{
		name: 'Avond/weekend-toeslag (tijd-narrative)',
		prose: 'Voor werk in de avonduren of in het weekend reken ik 50% toeslag.',
		// Time-of-day/weekend isn't the (fixed-tier) urgency enum — it should land as a surcharge
		// gated by a narrative. An interesting edge case; the report shows how the compiler handles it.
		expected: [r('urgency', 'surcharge_percent', 50, true)]
	},
	{
		name: 'Geen prijsregels (chitchat)',
		prose: 'Bedankt voor je bericht! Ik neem zo snel mogelijk contact met je op om de afspraak te bevestigen.',
		expected: []
	}
];

/** A fixture passes when ≥70% of its expected rules are matched (or, for the no-rules fixture,
 * when the compiler emits zero rules). Coarse on purpose — the report's value is the visible
 * per-rule expected-vs-actual diff, not a tight gate. */
export const MIN_RULE_MATCH_RATIO = 0.7;
/** Overall gate: ≥70% of fixtures acceptable. */
export const MIN_COMPILE_ACCURACY = 0.7;

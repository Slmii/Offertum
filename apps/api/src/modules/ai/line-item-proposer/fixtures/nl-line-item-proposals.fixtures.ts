import type { LineItemProposerInput } from '@/modules/ai/line-item-proposer/line-item-proposer.types';
import dedent from 'dedent';

/**
 * Hand-curated Dutch fixture corpus for the line-item-proposer accuracy harness.
 *
 * Each fixture is one offerteaanvraag + a realistic catalog (refs `C1`…). The
 * `expectedCatalogRefs` list is the set a human reviewer says SHOULD appear among
 * the proposer's `catalogLines` for the match to count as correct — we score a
 * fixture as a hit when the proposer returns at least one of them. This mirrors the
 * W10.1 acceptance criterion: ≥7/10 fixtures yield ≥1 correct catalog match.
 *
 * Catalogs are given to the model WITHOUT prices (engine-price design), so these
 * fixtures only exercise the MATCH decision, never pricing.
 *
 * Synthetic for now; augment with real customer requests after the first paying
 * customers. Trades are deliberately spread (loodgieter, schilder, tegelzetter,
 * hovenier, elektricien, fotograaf, …) so a prompt change that overfits one trade
 * shows up as a regression elsewhere.
 */
export interface LineItemProposerFixture {
	input: LineItemProposerInput;
	/** Catalog refs that count as a correct match (≥1 must appear in the output). */
	expectedCatalogRefs: string[];
	category: 'plumbing' | 'painting' | 'tiling' | 'garden' | 'electrical' | 'photography' | 'misc';
	/**
	 * Trade the proposer SHOULD tag any inferred labour line with (lowercase English, the same
	 * vocabulary the pricing rules use) — this is what lets a category-scoped hourly rate attach.
	 * `null` when no single trade applies (e.g. generic moving help). Grading is lenient: a `null`
	 * or omitted tag never fails (a miss isn't a mispricing) — only tagging a genuinely DIFFERENT
	 * trade fails, since that would apply the wrong hourly rate.
	 */
	expectedInferredCategory: string | null;
	/** One-liner explaining the labeling decision. */
	notes: string;
}

export const NL_LINE_ITEM_PROPOSER_FIXTURES: LineItemProposerFixture[] = [
	{
		category: 'plumbing',
		expectedCatalogRefs: ['C1', 'C2'],
		expectedInferredCategory: 'plumbing',
		notes: 'Boiler replacement — labor + the boiler unit are both in the catalog',
		input: {
			requestType: 'CV-ketel vervangen',
			deliverableHints: ['CV-ketel', 'HR-combi'],
			bodyText: dedent`
				Onze CV-ketel is kapot en moet vervangen worden door een nieuwe HR-combi-ketel.
				Rijtjeshuis, 4 radiatoren, 1 douche. Graag ook de oude ketel afvoeren.
			`,
			catalog: [
				{
					ref: 'C1',
					name: 'Arbeid installateur',
					description: 'Montage- en installatiewerk',
					unitLabel: 'uur'
				},
				{
					ref: 'C2',
					name: 'HR-combi-ketel',
					description: 'Nieuwe CV-ketel inclusief montagemateriaal',
					unitLabel: 'stuk'
				},
				{ ref: 'C3', name: 'Tegelwerk badkamer', description: 'Wand- en vloertegels', unitLabel: 'm²' }
			]
		}
	},
	{
		category: 'painting',
		expectedCatalogRefs: ['C1'],
		expectedInferredCategory: 'painting',
		notes: 'Interior painting — schilderwerk per m² catalog item',
		input: {
			requestType: 'Binnenschilderwerk woonkamer',
			deliverableHints: ['woonkamer', 'plafond'],
			bodyText: dedent`
				Ik wil graag mijn woonkamer en het plafond laten schilderen. De woonkamer is
				ongeveer 30 m². Wanden zijn nu behangen, mag eraf.
			`,
			catalog: [
				{ ref: 'C1', name: 'Schilderwerk wanden', description: 'Sausen/schilderen per m²', unitLabel: 'm²' },
				{ ref: 'C2', name: 'Voorrijkosten', description: 'Vaste voorrijkosten', unitLabel: 'forfait' },
				{ ref: 'C3', name: 'Arbeid schilder', description: 'Schilderwerk op uurbasis', unitLabel: 'uur' }
			]
		}
	},
	{
		category: 'tiling',
		expectedCatalogRefs: ['C1', 'C2'],
		expectedInferredCategory: 'tiling',
		notes: 'Bathroom tiling — both tiling labor and tile material match',
		input: {
			requestType: 'Badkamer betegelen',
			deliverableHints: ['badkamer', 'wandtegels', 'vloertegels'],
			bodyText: dedent`
				We renoveren onze badkamer (ongeveer 8 m² wand en 5 m² vloer) en willen graag
				nieuwe tegels laten plaatsen. Tegels mogen jullie leveren.
			`,
			catalog: [
				{ ref: 'C1', name: 'Tegelzetten', description: 'Plaatsen van wand- en vloertegels', unitLabel: 'm²' },
				{ ref: 'C2', name: 'Wandtegels standaard', description: 'Keramische wandtegel', unitLabel: 'm²' },
				{ ref: 'C3', name: 'Arbeid loodgieter', description: 'Sanitair aansluiten', unitLabel: 'uur' }
			]
		}
	},
	{
		category: 'garden',
		expectedCatalogRefs: ['C2'],
		expectedInferredCategory: 'gardening',
		notes: 'Garden — hedge trimming maps to the hovenier labor line',
		input: {
			requestType: 'Tuinonderhoud — haag snoeien',
			deliverableHints: ['haag', 'snoeien'],
			bodyText: dedent`
				Onze coniferenhaag (ongeveer 15 meter lang) is veel te hoog geworden. Kunnen
				jullie deze komen snoeien en het snoeiafval afvoeren?
			`,
			catalog: [
				{ ref: 'C1', name: 'Bestrating', description: 'Aanleg terras/bestrating', unitLabel: 'm²' },
				{ ref: 'C2', name: 'Arbeid hovenier', description: 'Snoei- en onderhoudswerk', unitLabel: 'uur' },
				{ ref: 'C3', name: 'Afvoer groenafval', description: 'Afvoeren snoeiafval', unitLabel: 'forfait' }
			]
		}
	},
	{
		category: 'electrical',
		expectedCatalogRefs: ['C1', 'C3'],
		expectedInferredCategory: 'electrical',
		notes: 'Electrical — extra sockets need both electrician labor and the socket material',
		input: {
			requestType: 'Extra stopcontacten plaatsen',
			deliverableHints: ['stopcontacten', 'keuken'],
			bodyText: dedent`
				In onze nieuwe keuken willen we 4 extra dubbele stopcontacten laten plaatsen,
				inclusief het wegwerken van de bedrading.
			`,
			catalog: [
				{ ref: 'C1', name: 'Arbeid elektricien', description: 'Installatiewerk elektra', unitLabel: 'uur' },
				{ ref: 'C2', name: 'Meterkast uitbreiden', description: 'Groep bijplaatsen', unitLabel: 'stuk' },
				{ ref: 'C3', name: 'Dubbel stopcontact', description: 'Inbouw wandcontactdoos', unitLabel: 'stuk' }
			]
		}
	},
	{
		category: 'photography',
		expectedCatalogRefs: ['C1'],
		expectedInferredCategory: 'photography',
		notes: 'Wedding photography — full-day package',
		input: {
			requestType: 'Bruiloftsfotografie',
			deliverableHints: ['bruiloft', 'hele dag'],
			bodyText: dedent`
				We trouwen op 14 juni en zoeken een fotograaf voor de hele dag, van het
				aankleden tot het avondfeest. Graag een nabewerkte fotoselectie online.
			`,
			catalog: [
				{ ref: 'C1', name: 'Fotoreportage hele dag', description: 'Volledige dagreportage', unitLabel: 'dag' },
				{ ref: 'C2', name: 'Pasfoto', description: 'Pasfoto in studio', unitLabel: 'stuk' },
				{ ref: 'C3', name: 'Nabewerking extra', description: 'Extra retouchering per foto', unitLabel: 'stuk' }
			]
		}
	},
	{
		category: 'plumbing',
		expectedCatalogRefs: ['C2'],
		expectedInferredCategory: 'plumbing',
		notes: 'Leaking tap — small labor job, only the plumber-labor line matches',
		input: {
			requestType: 'Lekkende kraan repareren',
			deliverableHints: ['kraan', 'keuken'],
			bodyText: dedent`
				De mengkraan in onze keuken lekt al een tijdje aan de onderkant. Kunnen jullie
				langskomen om dit te repareren of de kraan te vervangen?
			`,
			catalog: [
				{ ref: 'C1', name: 'CV-ketel onderhoud', description: 'Jaarlijkse beurt', unitLabel: 'stuk' },
				{
					ref: 'C2',
					name: 'Arbeid loodgieter',
					description: 'Reparatie- en installatiewerk',
					unitLabel: 'uur'
				},
				{
					ref: 'C3',
					name: 'Radiator vervangen',
					description: 'Demontage + montage radiator',
					unitLabel: 'stuk'
				}
			]
		}
	},
	{
		category: 'tiling',
		expectedCatalogRefs: ['C1'],
		expectedInferredCategory: 'tiling',
		notes: 'Floor leveling before tiling — egaliseren labor line matches',
		input: {
			requestType: 'Vloer egaliseren',
			deliverableHints: ['vloer', 'egaliseren'],
			bodyText: dedent`
				Voordat we laminaat leggen moet onze betonvloer van ongeveer 40 m² eerst
				worden geëgaliseerd. Kunnen jullie dat verzorgen?
			`,
			catalog: [
				{ ref: 'C1', name: 'Vloer egaliseren', description: 'Egaliseren per m²', unitLabel: 'm²' },
				{ ref: 'C2', name: 'Laminaat leggen', description: 'Leggen laminaatvloer', unitLabel: 'm²' },
				{ ref: 'C3', name: 'Plinten monteren', description: 'Plaatsen plinten', unitLabel: 'm' }
			]
		}
	},
	{
		category: 'garden',
		expectedCatalogRefs: ['C1', 'C2'],
		expectedInferredCategory: 'gardening',
		notes: 'New terrace — paving labor plus the paving stones material',
		input: {
			requestType: 'Terras aanleggen',
			deliverableHints: ['terras', 'tegels', '20 m²'],
			bodyText: dedent`
				We willen achter in de tuin een terras van ongeveer 20 m² laten aanleggen met
				grijze betontegels. Graag inclusief het uitvlakken van de ondergrond.
			`,
			catalog: [
				{ ref: 'C1', name: 'Bestrating leggen', description: 'Aanleg terras per m²', unitLabel: 'm²' },
				{ ref: 'C2', name: 'Betontegels grijs', description: 'Tegel 60x60', unitLabel: 'm²' },
				{ ref: 'C3', name: 'Haag snoeien', description: 'Snoeiwerk', unitLabel: 'uur' }
			]
		}
	},
	{
		category: 'misc',
		expectedCatalogRefs: ['C1'],
		expectedInferredCategory: null,
		notes: 'Moving help — generic labor day-rate is the only sensible match',
		input: {
			requestType: 'Verhuishulp',
			deliverableHints: ['verhuizen', 'tillen'],
			bodyText: dedent`
				We verhuizen volgende maand en zoeken twee mensen die ons een dag kunnen
				helpen met sjouwen en het in- en uitladen van de verhuiswagen.
			`,
			catalog: [
				{
					ref: 'C1',
					name: 'Arbeid algemeen',
					description: 'Algemene werkzaamheden op dagbasis',
					unitLabel: 'dag'
				},
				{ ref: 'C2', name: 'Materiaaltoeslag', description: 'Verbruiksmateriaal', unitLabel: 'forfait' },
				{ ref: 'C3', name: 'Schilderwerk', description: 'Schilderen per m²', unitLabel: 'm²' }
			]
		}
	}
];

/**
 * Dutch compile prompt for the pricing-playbook → typed-rules transformation.
 *
 * Design choices:
 *  - System prompt is fully Dutch — the playbook prose IS Dutch.
 *  - Strict rule-emission policy: don't infer rules that aren't EXPLICITLY in
 *    the prose. Owners hate false positives (rules they didn't write); they
 *    tolerate missed rules (those surface in the review pass).
 *  - `conditionNarrative` captures conditions the structured `condition` enum
 *    can't express (renovation age, order threshold, customer tenure). The
 *    quote pipeline (W11.6) uses AI verification at quote time for any rule
 *    with a non-null narrative.
 *  - Priority guidance: explicit higher-precedence rules ("but for emergencies…")
 *    get higher priority; default rules get 100. Manual overrides bump +1000 at
 *    engine time so the 0-1000 LLM range stays comfortably below them.
 */
export const PRICING_PLAYBOOK_COMPILE_SYSTEM_PROMPT_NL = `Je bent een rule-compiler voor een Nederlandse offerte-tool.

De gebruiker (een Nederlandse MKB-ondernemer) heeft in eigen woorden opgeschreven hoe hij of zij zijn prijzen bepaalt. Jouw taak: lees die tekst en extract elke pricing-regel als een typed object.

# Regeltypes en effect-shapes

Je mag alleen deze regeltypes uitgeven. Het \`effect.type\`-veld bepaalt welke shape je gebruikt:

| ruleType         | effect.type            | Toelichting |
|------------------|------------------------|-------------|
| hourly_rate      | rate_eur_per_hour      | Uurtarief voor arbeid. \`value\` = € per uur. |
| material_markup  | markup_percent         | Opslag op doorberekende materialen. \`value\` = percentage (0-100). |
| vat              | vat_rate               | BTW-percentage. \`value\` = 0, 9 of 21. |
| travel           | flat_fee_eur OF per_km_eur | Reiskosten. Bij \`per_km_eur\` mag \`freeUnderKm\` gevuld zijn (km waaronder gratis). |
| urgency          | surcharge_percent      | Spoedtoeslag. \`value\` = percentage extra. |
| discount         | discount_percent OF discount_eur | Korting. \`value\` = percentage of euro-bedrag. |
| minimum_order    | minimum_eur            | Minimum offertebedrag. \`value\` = euro. |

# Condition-velden

Elke regel heeft een \`condition\`-object met deze velden (vul ALTIJD in; gebruik \`null\` als het niet van toepassing is):
- \`category\`: vakgebied in lowercase ("plumbing", "electrical", "consultancy", etc.) of \`null\` voor alles.
- \`urgency\`: "emergency" / "high" / "normal" / "low" of \`null\` voor alle spoedniveaus.
- \`jurisdiction\`: "NL" / "BE" / "DE" (uppercase) of \`null\` voor alle landen.
- \`lineKind\`: "labor" / "material" of \`null\` voor beide.

# Effect-velden

Elke regel heeft een \`effect\`-object met deze velden:
- \`type\`: één van de waarden uit de tabel hierboven (verplicht, niet \`null\`).
- \`value\`: het numerieke bedrag/percentage (verplicht, niet \`null\`).
- \`freeUnderKm\`: alleen relevant voor \`per_km_eur\` reiskosten. Anders \`null\`.

# conditionNarrative — extra context dat niet in de gestructureerde condition past

De gestructureerde \`condition\` kan maar VIER dingen vastleggen: \`category\`, \`urgency\`, \`jurisdiction\`, \`lineKind\`. Alles ANDERS dat de regel inperkt MOET in \`conditionNarrative\` (korte Nederlandse omschrijving, max 200 tekens, in dezelfde taal als de oorspronkelijke prose).

**Verplicht een \`conditionNarrative\` invullen als de regel afhangt van** (schrijf de nuance in DEZELFDE TAAL als de oorspronkelijke tekst — als de gebruiker Nederlands schreef, schrijf je Nederlands terug; dit is wat de eigenaar in de UI ziet):

1. **Bedragen, drempels of hoeveelheden:**
   - "opdrachten boven €5.000" → \`"opdrachten met totaalbedrag boven € 5.000"\`
   - "voor projecten van meer dan 40 uur" → \`"projecten van meer dan 40 arbeidsuren"\`
   - "vanaf 10 stuks" → \`"bestellingen van 10 stuks of meer"\`

2. **Eigenschappen van het pand / project:**
   - "renovaties van woningen ouder dan 2 jaar" → \`"renovaties van woningen ouder dan 2 jaar"\`
   - "alleen monumentale panden" → \`"alleen monumentale panden"\`
   - "platte daken" → \`"alleen platte daken"\`

3. **Klant-eigenschappen die niet in de structured-condition passen:**
   - "klanten die ik al 5 jaar ken" → \`"klanten met een relatie van 5+ jaar"\`
   - "alleen bestaande klanten" → \`"alleen bestaande klanten"\`
   - "voor bedrijfsklanten" → \`"alleen bedrijfsklanten (B2B)"\`

4. **Geografische specificiteit binnen een jurisdiction:**
   - "alleen in Utrecht-stad" → \`"alleen binnen de stad Utrecht"\`
   - "binnen de Ring van Amsterdam" → \`"binnen de Ring van Amsterdam"\`

5. **Tijd, dagdeel, seizoen (los van \`urgency\`):**
   - "alleen op werkdagen" → \`"alleen op werkdagen (ma-vr)"\`
   - "voor projecten langer dan 2 weken" → \`"projecten langer dan 2 weken"\`
   - "in het hoogseizoen" → \`"alleen in het hoogseizoen"\`

6. **Sub-categorisaties binnen een category:**
   - "alleen CV-werk" → \`"alleen CV-werk"\`
   - "geen vloerverwarming" → \`"exclusief vloerverwarming"\`

**KRITISCHE REGEL — twijfelgeval beslissingsboom:**
Als de regel-zin een woord bevat dat:
- een getal/bedrag aanduidt ("boven", "vanaf", "meer dan", "minimaal", "ouder dan", "groter dan") OF
- een specifieke sub-set aanduidt ("alleen", "uitsluitend", "behalve", "behoudens", "monumentaal", "renovatie", "specifiek voor") OF
- een tijd/duur aanduidt ("langer dan", "binnen X dagen", "vanaf X uur")

→ DAN GA UIT VAN: \`conditionNarrative\` invullen. Beter te vaak dan te weinig.

**Voorbeelden van wanneer \`conditionNarrative\` op \`null\` mag:**
- "Mijn uurtarief is €75 per uur." → geen nuance → \`null\`
- "BTW is 21%." → geen nuance → \`null\`
- "Voor loodgieterswerk reken ik €95 per uur." → \`category: "plumbing"\` vangt het volledig → \`null\`
- "Voor spoedklussen reken ik 25% extra." → \`urgency: "emergency"\` vangt het volledig → \`null\`
- "Klanten in België krijgen BTW verlegd." → \`jurisdiction: "BE"\` vangt het volledig → \`null\`

**HARDE REGEL — dubbel NOOIT een structured field in de narrative.** Als een structured field
(\`urgency\`, \`category\`, \`jurisdiction\`, \`lineKind\`) dat je op deze regel zet de voorwaarde AL
VOLLEDIG vastlegt, dan MOET \`conditionNarrative\` \`null\` zijn — herhaal die voorwaarde niet als
narrative.
- "spoed zelfde dag" → \`urgency: "emergency"\` → \`conditionNarrative: null\` (dus NIET \`"klussen die dezelfde dag af moeten"\`)
- "op arbeid" / "op materialen" → \`lineKind: "labor"\`/\`"material"\` → \`null\`
- "voor loodgieterswerk" → \`category: "plumbing"\` → \`null\`
Een narrative die een structured field dubbelt is FOUT: de AI-verifier gaat 'm bij élke offerte
onnodig checken en kan de regel dan ten onrechte laten vervallen.

Als je TWIJFELT: dekt GÉÉN enkel structured field de voorwaarde, vul dan \`conditionNarrative\` in.
Een AI verifier checkt het later per offerte; bij niet-structureerbare condities kost over-emissie
weinig, onder-emissie betekent dat de regel ten onrechte wordt toegepast. Maar dubbel nooit een
condition die al in een structured field staat — dat is géén "twijfelgeval".

# "Behalve voor X" / uitzondering-zinnen — maak ALTIJD twee regels

Zinnen met \`"behalve voor X"\`, \`"met uitzondering van X"\`, \`"behoudens X"\`, \`"tenzij X"\` beschrijven TWEE prijsregels: de default + de uitzondering. Maak voor zulke zinnen ALTIJD twee regels in je output:

**Verkeerd** (één regel met geïnverteerde narrative):
> Prose: "Minimumorder is € 200, behalve voor bestaande klanten."
> ❌ \`{ effect: { value: 200 }, conditionNarrative: "alleen bestaande klanten", priority: 500 }\`
> (De AI verifier zou bij bestaande klanten "ja" zeggen en het € 200 minimum toepassen — precies omgekeerd van wat de tekst zegt.)

**Goed** (twee aparte regels — default + uitzondering met tegengesteld effect):
> Prose: "Minimumorder is € 200, behalve voor bestaande klanten."
> ✅ Regel A: \`{ effect: { value: 200 }, conditionNarrative: null, priority: 100 }\` — de default
> ✅ Regel B: \`{ effect: { value: 0 }, conditionNarrative: "alleen bestaande klanten", priority: 500 }\` — de uitzondering die het minimum opheft

Meer voorbeelden:
- "BTW is 21%, behalve voor renovaties van woningen ouder dan 2 jaar — 9%" → twee VAT regels (21% default + 9% gated op narrative)
- "Materialen + 15% opslag, behalve monumentale panden waar ik geen opslag reken" → twee MATERIAL_MARKUP regels (15% default + 0% gated op narrative)
- "Reiskosten € 0,45/km, behalve voor klanten in Utrecht-stad daar gratis" → twee TRAVEL regels (€ 0,45/km default + € 0/km gated op narrative)

De **default-regel** krijgt \`priority: 100\` + \`conditionNarrative: null\`. De **uitzondering** krijgt \`priority: 500\` (of 800 bij zeer specifieke uitzonderingen) + een \`conditionNarrative\` die POSITIEF de uitzondering beschrijft (niet de default). De AI verifier checkt bij elke offerte of de narrative van toepassing is; als JA → de uitzondering wint van de default door priority.

# Regels voor extractie

1. **Geen verzinsels.** Geef alleen regels uit die EXPLICIET in de tekst staan. Twijfel? Niet emitten. Bevat de tekst GEEN concrete prijsinformatie — alleen een groet, contactgegevens, losse notities, of een leeg/onafgemaakt woord zoals \`"bijvoorbeeld"\` of \`"test"\` — geef dan een LEGE \`rules\`-array terug. Vul de tekst NOOIT aan met verzonnen voorbeeldregels; ook niet als een aanhef als "bijvoorbeeld" of "voorbeeld:" lijkt te vragen om een voorbeeld. Genereer alleen op basis van wat de gebruiker daadwerkelijk heeft geschreven.
2. **Eén regel per uitspraak.** Als de gebruiker zegt "€85/uur voor loodgieterswerk en €95 voor elektra", maak twee aparte hourly_rate regels (één met \`category: "plumbing"\`, één met \`category: "electrical"\`).
3. **Priority:**
   - Default uitspraken ("mijn uurtarief is X"): \`priority: 100\`
   - Uitzonderingen op de default ("maar voor spoedklussen…", "behalve voor X"): \`priority: 500\`
   - Zeer specifieke uitzonderingen (één klant, één regio): \`priority: 800\`
4. **Description:** korte Nederlandse omschrijving van wat deze regel doet, max 1 zin. Bijvoorbeeld: "Loodgieterswerk: €85/uur" of "Spoedtoeslag binnen 24 uur: 25%". Dit is wat de eigenaar ziet in de UI — gebruik dezelfde taal als de prose.
5. **Lowercase voor enums.** \`ruleType\`, \`condition.category\`, \`condition.urgency\`, \`condition.lineKind\` zijn altijd lowercase. \`jurisdiction\` is uppercase (NL/BE/DE).
6. **Bedragen zijn getallen, geen strings.** \`value: 75\`, niet \`value: "75"\` of \`value: "€75"\`.
7. **Percentages zijn getallen 0-100.** 21% BTW → \`value: 21\`, niet \`0.21\`.

# Output

JSON object: \`{ "rules": [...] }\`. Lege array als de tekst geen prijsregels bevat (bijvoorbeeld alleen contactgegevens of irrelevante notities).`;

/**
 * Build the full prompt for the AIClient. System instructions + the playbook
 * prose framed as input. Matches the convention used by classifier + extractor
 * (single string sent to OpenAI's Responses API as `input`, no system/user
 * split — the AIClient interface doesn't expose that).
 */
export function buildPricingPlaybookCompilePromptNL(playbookText: string): string {
	return `${PRICING_PLAYBOOK_COMPILE_SYSTEM_PROMPT_NL}\n\n---\n\nExtract de prijsregels uit deze tekst:\n\n---\n${playbookText}\n---`;
}

/**
 * Dutch compile prompt for the pricing-playbook → typed-rules transformation.
 *
 * Design choices:
 *  - System prompt is fully Dutch — the playbook prose IS Dutch, switching
 *    languages would confuse the model on the source-span extraction.
 *  - Strict rule-emission policy: don't infer rules that aren't EXPLICITLY in
 *    the prose. Owners hate false positives (rules they didn't write); they
 *    tolerate missed rules (those surface in the review pass).
 *  - Each rule's `sourceSpan` is mandatory in the description but allowed to be
 *    `null` in the Zod schema as a safety hatch — if the model can't pin a
 *    rule to specific characters, we'd rather have the rule with a null span
 *    than no rule at all.
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

# Regels voor extractie

1. **Geen verzinsels.** Geef alleen regels uit die EXPLICIET in de tekst staan. Twijfel? Niet emitten.
2. **Eén regel per uitspraak.** Als de gebruiker zegt "€85/uur voor loodgieterswerk en €95 voor elektra", maak twee aparte hourly_rate regels (één met \`category: "plumbing"\`, één met \`category: "electrical"\`).
3. **Source span verplicht waar mogelijk.** Geef \`sourceSpan: { start, end }\` met de exacte karakteroffsets in de oorspronkelijke tekst die deze regel produceerde. Alleen \`null\` als je echt niet kunt aanwijzen welk stuk tekst.
4. **Priority:**
   - Default uitspraken ("mijn uurtarief is X"): \`priority: 100\`
   - Uitzonderingen op de default ("maar voor spoedklussen…", "behalve voor X"): \`priority: 500\`
   - Zeer specifieke uitzonderingen (één klant, één regio): \`priority: 800\`
5. **Description:** korte Nederlandse omschrijving van wat deze regel doet, max 1 zin. Bijvoorbeeld: "Loodgieterswerk: €85/uur" of "Spoedtoeslag binnen 24 uur: 25%".
6. **Lowercase voor enums.** \`ruleType\`, \`condition.category\`, \`condition.urgency\`, \`condition.lineKind\` zijn altijd lowercase. \`jurisdiction\` is uppercase (NL/BE/DE).
7. **Bedragen zijn getallen, geen strings.** \`value: 75\`, niet \`value: "75"\` of \`value: "€75"\`.
8. **Percentages zijn getallen 0-100.** 21% BTW → \`value: 21\`, niet \`0.21\`.

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

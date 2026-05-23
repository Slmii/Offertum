import dedent from 'dedent';
import type { ShouldReplyInput } from '@/modules/ai/should-reply/should-reply.types';

/**
 * Dutch prompt for the should-reply classifier. Runs on a customer reply that
 * already attached to a tracked thread, so the question is narrow: does THIS message
 * expect a written answer, or is it a conversation closer?
 *
 * Calibration notes (informs how the prompt should weight cases):
 *  - Conversation closer = "bedankt", "tot dan", "ok", "perfect", "akkoord", a thumbs-
 *    up emoji, a polite acknowledgement of a previous answer. Default to `shouldReply: false`.
 *  - Anything containing a question mark or a request ("kun je…", "wil je…", "wanneer…")
 *    is almost always `shouldReply: true`.
 *  - When in doubt, lean toward `shouldReply: true` — a missed draft is recoverable
 *    (owner clicks "Concept-vervolg opstellen"); an unwanted auto-draft adds noise.
 *
 * Sibling files for other locales: `en.ts`, `de.ts`, `fr.ts`. Caller picks the right
 * file based on `Organization.locale` once that column exists.
 */
export function buildShouldReplyPromptNL(input: ShouldReplyInput): string {
	const subject = input.subject?.trim() || '(geen onderwerp)';
	const fromLabel = input.fromName ? `${input.fromName} <${input.fromEmail ?? '?'}>` : (input.fromEmail ?? '?');
	const body = input.bodyText.trim().slice(0, 4000);

	const encodedSubject = JSON.stringify(subject);
	const encodedFromLabel = JSON.stringify(fromLabel);
	const encodedBody = JSON.stringify(body);

	return dedent`
		Je beoordeelt of een klantreactie in een lopende e-mailconversatie een nieuw schriftelijk antwoord verwacht van de ondernemer die het bericht ontvangt.

		## Achtergrond
		- De ondernemer heeft eerder een offerte of antwoord verstuurd; dit bericht is de reactie van de klant daarop.
		- De ondernemer gebruikt een tool die automatisch een concept-antwoord opstelt zodra een klant reageert. Die tool gebruikt jouw beslissing om te bepalen of een concept nodig is.

		## Beslis
		\`shouldReply: true\`  — de klant stelt een vraag, vraagt om aanvullende informatie, wijzigt iets, of stelt een actie voor die om bevestiging vraagt. Een concept-antwoord is zinvol.

		\`shouldReply: false\` — de klant rondt het gesprek af zonder iets nieuws te vragen. Voorbeelden:
		  • Korte bedankjes ("Bedankt!", "Dank je wel", "Top, bedankt")
		  • Afsluiters ("Tot dan", "Tot ziens", "Tot maandag", "Fijne avond", "Prettig weekend")
		  • Bevestigingen ("Akkoord", "Perfect", "Prima", "Oké", "Duidelijk", "Geen probleem")
		  • Combinaties hiervan ("Bedankt, tot maandag!", "Perfect, dank je wel")
		  • Beleefde sign-offs zonder vraag ("Groet", "Met vriendelijke groet", emoji's)
		  • Bevestigingen van een afspraak zonder verdere vraag ("Ik ben er om 14u")

		## Twijfelregels
		- Bevat het bericht een vraagteken? Bijna altijd \`shouldReply: true\`.
		- Vraagt het bericht om iets ("kun je", "wil je", "graag", "ik hoor het graag")? \`shouldReply: true\`.
		- Bij twijfel: kies \`shouldReply: true\`. Een gemist concept is herstelbaar; een overbodig concept is ruis.

		## Invoer
		Onderwerp: ${encodedSubject}
		Afzender: ${encodedFromLabel}
		Bericht:
		${encodedBody}

		Geef terug:
		  - \`shouldReply\`: boolean
		  - \`confidence\`: getal tussen 0 en 1
		  - \`reason\`: één korte Nederlandse zin met de motivatie
	`;
}

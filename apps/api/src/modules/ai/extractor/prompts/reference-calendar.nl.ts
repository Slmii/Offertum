/**
 * A small, pre-computed calendar for the extractor prompt.
 *
 * WHY: relative dates ("eind volgende week", "aanstaande donderdag", "in de week van 25 mei")
 * can only be resolved by someone who knows which WEEKDAY the reference date is — and the
 * prompt used to hand the model a bare ISO date and leave that arithmetic to it. Language
 * models are unreliable at exactly this. It happened to work until an unrelated prompt edit
 * (adding `customerPhone`) nudged the output, and "eind volgende week" silently moved a full
 * week later: nothing about the date rules had changed. Deterministic work belongs in code, so
 * we do the calendar maths here and the model only has to look the answer up.
 *
 * All arithmetic is on the calendar date in UTC — no timezone can shift a day.
 * Weeks run Monday–Sunday (ISO / Dutch usage), so on a Saturday "volgende week" is the week
 * that starts two days later, not the one after that.
 */

const WEEKDAYS = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'] as const;
const MONTHS = [
	'januari',
	'februari',
	'maart',
	'april',
	'mei',
	'juni',
	'juli',
	'augustus',
	'september',
	'oktober',
	'november',
	'december'
] as const;

const DAY_MS = 86_400_000;
const LOOKAHEAD_DAYS = 21;

const iso = (date: Date): string => date.toISOString().slice(0, 10);
const addDays = (date: Date, days: number): Date => new Date(date.getTime() + days * DAY_MS);
const label = (date: Date): string =>
	`${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()} = ${iso(date)}`;

function weekLine(name: string, monday: Date): string {
	return `- ${name}: ${label(monday)} t/m ${label(addDays(monday, 6))}. De vrijdag van die week is ${iso(addDays(monday, 4))}.`;
}

export function buildReferenceCalendarNL(referenceDateIso: string): string {
	const reference = new Date(`${referenceDateIso}T00:00:00Z`);
	if (Number.isNaN(reference.getTime())) {
		return `Referentiedatum: ${referenceDateIso}.`;
	}

	// Monday of the reference week. getUTCDay(): Sunday = 0, so shift it to the END of the week.
	const daysSinceMonday = (reference.getUTCDay() + 6) % 7;
	const thisMonday = addDays(reference, -daysSinceMonday);

	const endOfThisMonth = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + 1, 0));
	const endOfNextMonth = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + 2, 0));

	// First Monday–Friday strictly after the reference date.
	let nextWorkingDay = addDays(reference, 1);
	while (nextWorkingDay.getUTCDay() === 0 || nextWorkingDay.getUTCDay() === 6) {
		nextWorkingDay = addDays(nextWorkingDay, 1);
	}

	const comingDays = Array.from({ length: LOOKAHEAD_DAYS }, (_, i) => `  ${label(addDays(reference, i + 1))}`);

	return [
		`Referentiedatum (vandaag): ${label(reference)}.`,
		weekLine('Deze week', thisMonday),
		weekLine('Volgende week', addDays(thisMonday, 7)),
		weekLine('De week daarna', addDays(thisMonday, 14)),
		`- Eerstvolgende werkdag na vandaag: ${label(nextWorkingDay)}.`,
		`- Einde van deze maand: ${iso(endOfThisMonth)}. Einde van volgende maand: ${iso(endOfNextMonth)}.`,
		`- De komende ${LOOKAHEAD_DAYS} dagen:`,
		...comingDays
	].join('\n');
}

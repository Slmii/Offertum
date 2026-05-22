import { renderNotificationEmail, type RenderedEmail } from '@/lib/mails/notifications/template-shell';

export interface WeeklyDigestEmailInput {
	openCount: number;
	coldCount: number;
	pendingFollowUpCount: number;
	estimatedValueEuros: number | null;
	dashboardUrl: string;
}

function formatEuros(value: number): string {
	return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(
		value
	);
}

export function buildWeeklyDigestEmail(input: WeeklyDigestEmailInput): RenderedEmail {
	const { openCount, coldCount, pendingFollowUpCount, estimatedValueEuros, dashboardUrl } = input;
	const subject = `Wekelijks overzicht: ${openCount} open offerteaanvragen`;

	const valuePart =
		estimatedValueEuros !== null
			? `Geschatte waarde: <strong>${formatEuros(estimatedValueEuros)}</strong>.`
			: 'Geschatte waarde wordt zichtbaar zodra er offertes met bedragen gekoppeld zijn.';

	const paragraphs: string[] = [
		`Je hebt deze week <strong>${openCount}</strong> open offerteaanvragen, waarvan <strong>${coldCount}</strong> koud.`,
		`<strong>${pendingFollowUpCount}</strong> automatische follow-up${pendingFollowUpCount === 1 ? '' : 's'} wacht op je beoordeling.`,
		valuePart
	];

	return renderNotificationEmail({
		subject,
		heading: 'Wekelijks overzicht',
		preheader: `${openCount} open, ${coldCount} koud, ${pendingFollowUpCount} follow-ups klaar`,
		bodyParagraphs: paragraphs,
		cta: { label: 'Open dashboard', url: dashboardUrl },
		footnote:
			'Wil je deze e-mail niet meer ontvangen? Pas je voorkeuren aan via Instellingen → Notificaties in Quoteom.'
	});
}

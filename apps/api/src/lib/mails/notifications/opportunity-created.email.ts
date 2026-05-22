import { renderNotificationEmail, type RenderedEmail } from '@/lib/mails/notifications/template-shell';

interface OpportunityCreatedEmailInput {
	customerName: string | null;
	requestType: string;
	urgency: string;
	deadline: string | null;
	opportunityUrl: string;
}

const URGENCY_LABEL_NL: Record<string, string> = {
	emergency: 'Spoed',
	high: 'Hoog',
	normal: 'Normaal',
	low: 'Laag'
};

export function buildOpportunityCreatedEmail(input: OpportunityCreatedEmailInput): RenderedEmail {
	const { customerName, requestType, urgency, deadline, opportunityUrl } = input;
	const urgencyLabel = URGENCY_LABEL_NL[urgency] ?? urgency;
	const subject = customerName
		? `Nieuwe offerteaanvraag: ${customerName} — ${requestType}`
		: `Nieuwe offerteaanvraag: ${requestType}`;

	const opener = customerName
		? `<strong>${customerName}</strong> heeft een offerteaanvraag binnengestuurd voor <strong>${requestType}</strong>.`
		: `Er is een nieuwe offerteaanvraag binnengekomen voor <strong>${requestType}</strong>.`;

	const paragraphs: string[] = [
		opener,
		`Urgentie: <strong>${urgencyLabel}</strong>${deadline ? ` &middot; Deadline: <strong>${deadline}</strong>` : ''}`,
		'Open de aanvraag om het AI-concept te bekijken en te versturen.'
	];

	return renderNotificationEmail({
		subject,
		heading: 'Nieuwe offerteaanvraag',
		preheader: customerName ? `${customerName} — ${requestType}` : requestType,
		bodyParagraphs: paragraphs,
		cta: { label: 'Bekijk aanvraag', url: opportunityUrl }
	});
}

import { escapeHtml } from '@/lib/mails/escape';
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
	// subject is plain text (not HTML) — no escaping needed there.
	const subject = customerName
		? `Nieuwe offerteaanvraag: ${customerName} — ${requestType}`
		: `Nieuwe offerteaanvraag: ${requestType}`;

	const safeCustomerName = customerName ? escapeHtml(customerName) : null;
	const safeRequestType = escapeHtml(requestType);

	const opener = safeCustomerName
		? `<strong>${safeCustomerName}</strong> heeft een offerteaanvraag binnengestuurd voor <strong>${safeRequestType}</strong>.`
		: `Er is een nieuwe offerteaanvraag binnengekomen voor <strong>${safeRequestType}</strong>.`;

	// deadline is AI-extracted from the customer email; escape before embedding in HTML.
	const safeDeadline = deadline ? escapeHtml(deadline) : null;

	const paragraphs: string[] = [
		opener,
		`Urgentie: <strong>${urgencyLabel}</strong>${safeDeadline ? ` &middot; Deadline: <strong>${safeDeadline}</strong>` : ''}`,
		'Open de aanvraag om het AI-concept te bekijken en te versturen.'
	];

	return renderNotificationEmail({
		subject,
		heading: 'Nieuwe offerteaanvraag',
		// preheader is rendered inside a <span> in template-shell — must be escaped.
		preheader: safeCustomerName ? `${safeCustomerName} — ${safeRequestType}` : safeRequestType,
		bodyParagraphs: paragraphs,
		cta: { label: 'Bekijk aanvraag', url: opportunityUrl }
	});
}

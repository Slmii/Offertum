import { escapeHtml } from '@/lib/mails/escape';
import { renderNotificationEmail, type RenderedEmail } from '@/lib/mails/notifications/template-shell';

interface CustomerReplyEmailInput {
	customerName: string | null;
	requestType: string;
	subject: string | null;
	opportunityUrl: string;
}

export function buildCustomerReplyEmail(input: CustomerReplyEmailInput): RenderedEmail {
	const { customerName, requestType, subject, opportunityUrl } = input;
	// mailSubject is plain text (not HTML) — raw values are fine there.
	const customer = customerName ?? 'De klant';
	const mailSubject = `Reactie van ${customer} op ${requestType}`;

	const safeCustomer = escapeHtml(customer);
	const safeRequestType = escapeHtml(requestType);
	// subject is the customer's own email subject line — AI-extracted or inbound header.
	const safeSubject = subject ? escapeHtml(subject) : null;

	const paragraphs: string[] = [
		`<strong>${safeCustomer}</strong> heeft gereageerd op de offerteaanvraag voor <strong>${safeRequestType}</strong>.`,
		safeSubject ? `Onderwerp: <em>${safeSubject}</em>` : 'Open de aanvraag om de reactie te lezen.',
		'De status is automatisch terug op <strong>Nieuw</strong> gezet, zodat je het overzicht houdt.'
	];

	return renderNotificationEmail({
		subject: mailSubject,
		heading: 'Reactie van klant',
		// preheader is rendered inside a <span> in template-shell — must be escaped.
		preheader: `${safeCustomer} reageerde op ${safeRequestType}`,
		bodyParagraphs: paragraphs,
		cta: { label: 'Open aanvraag', url: opportunityUrl }
	});
}

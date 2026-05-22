import { renderNotificationEmail, type RenderedEmail } from '@/lib/mails/notifications/template-shell';

interface CustomerReplyEmailInput {
	customerName: string | null;
	requestType: string;
	subject: string | null;
	opportunityUrl: string;
}

export function buildCustomerReplyEmail(input: CustomerReplyEmailInput): RenderedEmail {
	const { customerName, requestType, subject, opportunityUrl } = input;
	const customer = customerName ?? 'De klant';
	const mailSubject = `Reactie van ${customer} op ${requestType}`;

	const paragraphs: string[] = [
		`<strong>${customer}</strong> heeft gereageerd op de offerteaanvraag voor <strong>${requestType}</strong>.`,
		subject ? `Onderwerp: <em>${subject}</em>` : 'Open de aanvraag om de reactie te lezen.',
		'De status is automatisch terug op <strong>Nieuw</strong> gezet, zodat je het overzicht houdt.'
	];

	return renderNotificationEmail({
		subject: mailSubject,
		heading: 'Reactie van klant',
		preheader: `${customer} reageerde op ${requestType}`,
		bodyParagraphs: paragraphs,
		cta: { label: 'Open aanvraag', url: opportunityUrl }
	});
}

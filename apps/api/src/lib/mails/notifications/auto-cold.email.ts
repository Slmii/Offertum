import { renderNotificationEmail, type RenderedEmail } from '@/lib/mails/notifications/template-shell';

interface AutoColdEmailInput {
	customerName: string | null;
	requestType: string;
	daysSinceSent: number;
	opportunityUrl: string;
}

export function buildAutoColdEmail(input: AutoColdEmailInput): RenderedEmail {
	const { customerName, requestType, daysSinceSent, opportunityUrl } = input;
	const customer = customerName ?? 'De klant';
	const subject = customerName
		? `Offerteaanvraag op koud: ${customerName} — ${requestType}`
		: `Offerteaanvraag op koud: ${requestType}`;

	const paragraphs: string[] = [
		`Quoteom heeft de offerteaanvraag voor <strong>${requestType}</strong>${customerName ? ` van <strong>${customer}</strong>` : ''} automatisch op <strong>Koud</strong> gezet — er is ${daysSinceSent} dag${daysSinceSent === 1 ? '' : 'en'} geen reactie gekomen na je laatste bericht en alle automatische herinneringen zijn verstuurd.`,
		'Open de aanvraag als je toch nog een vervolg wilt sturen of als je de status wilt aanpassen.'
	];

	return renderNotificationEmail({
		subject,
		heading: 'Aanvraag automatisch koud gezet',
		preheader: customerName
			? `${customer} — ${requestType} (${daysSinceSent}d stil)`
			: `${requestType} (${daysSinceSent}d stil)`,
		bodyParagraphs: paragraphs,
		cta: { label: 'Open aanvraag', url: opportunityUrl },
		footnote:
			'Wil je deze e-mail niet meer ontvangen? Pas je voorkeuren aan via Instellingen → Notificaties in Quoteom.'
	});
}

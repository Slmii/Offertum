import { escapeHtml } from '@/lib/mails/escape';
import { renderNotificationEmail, type RenderedEmail } from '@/lib/mails/notifications/template-shell';
import { pluralize } from '@offertum/shared';

interface AutoColdEmailInput {
	customerName: string | null;
	requestType: string;
	daysSinceSent: number;
	opportunityUrl: string;
}

export function buildAutoColdEmail(input: AutoColdEmailInput): RenderedEmail {
	const { customerName, requestType, daysSinceSent, opportunityUrl } = input;
	const customer = customerName ?? 'De klant';
	// subject is plain text (not HTML) — raw values are fine there.
	const subject = customerName
		? `Offerteaanvraag op koud: ${customerName} — ${requestType}`
		: `Offerteaanvraag op koud: ${requestType}`;

	const safeCustomer = escapeHtml(customer);
	const safeRequestType = escapeHtml(requestType);

	const paragraphs: string[] = [
		`Offertum heeft de offerteaanvraag voor <strong>${safeRequestType}</strong>${customerName ? ` van <strong>${safeCustomer}</strong>` : ''} automatisch op <strong>Koud</strong> gezet — er is ${daysSinceSent} ${pluralize(daysSinceSent, 'dag', 'dagen')} geen reactie gekomen na je laatste bericht en alle automatische herinneringen zijn verstuurd.`,
		'Open de aanvraag als je toch nog een vervolg wilt sturen of als je de status wilt aanpassen.'
	];

	return renderNotificationEmail({
		subject,
		heading: 'Aanvraag automatisch koud gezet',
		// preheader is rendered inside a <span> in template-shell — must be escaped.
		preheader: customerName
			? `${safeCustomer} — ${safeRequestType} (${daysSinceSent}d stil)`
			: `${safeRequestType} (${daysSinceSent}d stil)`,
		bodyParagraphs: paragraphs,
		cta: { label: 'Open aanvraag', url: opportunityUrl },
		footnote:
			'Wil je deze e-mail niet meer ontvangen? Pas je voorkeuren aan via Instellingen → Notificaties in Offertum.'
	});
}

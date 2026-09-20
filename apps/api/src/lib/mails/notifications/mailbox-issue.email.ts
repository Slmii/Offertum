import { escapeHtml } from '@/lib/mails/escape';
import { renderNotificationEmail, type RenderedEmail } from '@/lib/mails/notifications/template-shell';

interface MailboxIssueEmailInput {
	// The affected mailbox address (e.g. the connected Gmail/Outlook account).
	mailboxEmail: string;
	// Display label for the provider ('Gmail' / 'Microsoft').
	providerLabel: string;
	// Deep link to /settings/email to reconnect.
	settingsUrl: string;
}

export function buildMailboxIssueEmail(input: MailboxIssueEmailInput): RenderedEmail {
	const { mailboxEmail, providerLabel, settingsUrl } = input;
	// subject is plain text (not HTML) — raw values are fine there.
	const subject = `Mailbox-probleem: ${mailboxEmail}`;

	const safeEmail = escapeHtml(mailboxEmail);
	const safeProvider = escapeHtml(providerLabel);

	const paragraphs: string[] = [
		`De koppeling met je ${safeProvider}-mailbox <strong>${safeEmail}</strong> is verbroken. Offertum kan geen nieuwe e-mails meer inlezen en geen antwoorden meer versturen vanaf dit account.`,
		'Dit gebeurt meestal wanneer de toegang is ingetrokken of het wachtwoord is gewijzigd. Je aanvragen, concepten en geschiedenis blijven bewaard.',
		'Koppel de mailbox opnieuw zodat Offertum weer meeleest.'
	];

	return renderNotificationEmail({
		subject,
		heading: 'Mailbox-probleem',
		// preheader is rendered inside a <span> in template-shell — must be escaped.
		preheader: `De koppeling met ${safeEmail} is verbroken`,
		bodyParagraphs: paragraphs,
		cta: { label: 'Mailbox opnieuw koppelen', url: settingsUrl }
	});
}

import { QUOTEOM_NOTIFICATION_HEADER, QUOTEOM_NOTIFICATION_HEADER_VALUE } from '@/lib/email/bulk-mail-filter';
import { Logger } from '@nestjs/common';

const logger = new Logger('Mail');

interface SendEmailInput {
	to: string;
	subject: string;
	html: string;
	text: string;
	/**
	 * When the recipient's inbox is connected to Quoteom, the outbound email lands
	 * back as an inbound RawMessage and the classifier would otherwise treat its body
	 * (which describes a quote request) as a new quote. Stamping the
	 * `X-Quoteom-Notification` header lets the bulk-mail filter short-circuit those
	 * RawMessages before they reach the classifier. Default `true` — set to `false`
	 * for the small class of emails that ARE genuinely user-facing prose (currently
	 * none; the magic-link + invite emails are both fine to mark).
	 */
	isQuoteomNotification?: boolean;
	/**
	 * Message to log in dev when no RESEND_API_KEY is configured.
	 * Typically contains the magic-link URL or invite URL so flows still work locally.
	 */
	devFallbackLog?: string;
}

/**
 * Single chokepoint for outgoing email. Switches automatically:
 *  - With RESEND_API_KEY → POST to Resend's HTTP API.
 *  - Without RESEND_API_KEY → log `devFallbackLog` via the global Logger (routes
 *    through LogService — see main.ts useLogger wiring).
 */
export async function sendEmail(input: SendEmailInput): Promise<void> {
	const { to, subject, html, text, devFallbackLog, isQuoteomNotification = true } = input;

	if (!process.env.RESEND_API_KEY) {
		if (devFallbackLog) {
			logger.log(`\n  ${devFallbackLog}\n`);
		}
		return;
	}

	const fromAddress = process.env.RESEND_EMAIL_FROM ?? 'onboarding@resend.dev';
	const from = `Quoteom <${fromAddress}>`;

	const headers: Record<string, string> = {};
	if (isQuoteomNotification) {
		headers[QUOTEOM_NOTIFICATION_HEADER] = QUOTEOM_NOTIFICATION_HEADER_VALUE;
	}

	const response = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			from,
			to,
			subject,
			html,
			text,
			headers: Object.keys(headers).length > 0 ? headers : undefined
		})
	});

	if (!response.ok) {
		throw new Error(`Resend error: ${await response.text()}`);
	}
}

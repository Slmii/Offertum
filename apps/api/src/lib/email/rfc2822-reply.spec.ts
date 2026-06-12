import { buildRfc2822Reply, composeReplySubject } from '@/lib/email/rfc2822-reply';
import { describe, expect, it } from '@jest/globals';

function decode(rawBase64Url: string): string {
	return Buffer.from(rawBase64Url, 'base64url').toString('utf-8');
}

describe('buildRfc2822Reply', () => {
	it('emits threading headers and a plain-text body', () => {
		const message = decode(
			buildRfc2822Reply({
				to: 'klant@example.com',
				from: 'inbox@bedrijf.nl',
				fromName: 'Jan Jansen',
				subject: 'Re: Badkamer',
				body: 'Beste klant,\n\nBedankt voor uw aanvraag.',
				inReplyTo: '<orig-123@mail.example.com>',
				references: '<thread-1@mail.example.com>'
			})
		);

		expect(message).toContain('From: Jan Jansen <inbox@bedrijf.nl>');
		expect(message).toContain('To: klant@example.com');
		expect(message).toContain('In-Reply-To: <orig-123@mail.example.com>');
		expect(message).toContain('References: <thread-1@mail.example.com> <orig-123@mail.example.com>');
		expect(message).toContain('Bedankt voor uw aanvraag.');
	});

	it('strips CRLF from interpolated header values so they cannot inject extra headers', () => {
		const message = decode(
			buildRfc2822Reply({
				to: 'klant@example.com\r\nBcc: attacker@evil.example',
				from: 'inbox@bedrijf.nl',
				fromName: null,
				subject: 'Offerte\r\nX-Injected: yes',
				body: 'Body',
				inReplyTo: '<a@b>\r\nBcc: attacker2@evil.example',
				references: null
			})
		);

		// No LINE may start with an injected header — the smuggled text must stay
		// flattened inside its original header's value.
		const headerSection = message.split('\r\n\r\n')[0] ?? '';
		const lines = headerSection.split('\r\n');
		expect(lines.some(line => line.startsWith('Bcc:'))).toBe(false);
		expect(lines.some(line => line.startsWith('X-Injected:'))).toBe(false);
		expect(lines.find(line => line.startsWith('To:'))).toBe('To: klant@example.com Bcc: attacker@evil.example');
	});

	it('strips CRLF smuggled through a display name', () => {
		const message = decode(
			buildRfc2822Reply({
				to: 'klant@example.com',
				from: 'inbox@bedrijf.nl',
				fromName: 'Jan\r\nBcc: attacker@evil.example',
				subject: 'Offerte',
				body: 'Body',
				inReplyTo: null,
				references: null
			})
		);

		const lines = (message.split('\r\n\r\n')[0] ?? '').split('\r\n');
		expect(lines.some(line => line.startsWith('Bcc:'))).toBe(false);
	});

	it('switches to multipart/mixed when attachments are present', () => {
		const message = decode(
			buildRfc2822Reply({
				to: 'klant@example.com',
				from: 'inbox@bedrijf.nl',
				fromName: null,
				subject: 'Offerte',
				body: 'Zie bijlage.',
				inReplyTo: null,
				references: null,
				attachments: [{ filename: 'offerte.pdf', contentType: 'application/pdf', data: Buffer.from('PDFDATA') }]
			})
		);

		expect(message).toContain('Content-Type: multipart/mixed; boundary=');
		expect(message).toContain('Content-Disposition: attachment; filename="offerte.pdf"');
		expect(message).toContain('Content-Transfer-Encoding: base64');
	});
});

describe('composeReplySubject', () => {
	it('prefixes Re: once and keeps existing reply prefixes', () => {
		expect(composeReplySubject('Badkamer')).toBe('Re: Badkamer');
		expect(composeReplySubject('Re: Badkamer')).toBe('Re: Badkamer');
		expect(composeReplySubject('antw: Badkamer')).toBe('antw: Badkamer');
		expect(composeReplySubject(null)).toBe('Re:');
	});
});

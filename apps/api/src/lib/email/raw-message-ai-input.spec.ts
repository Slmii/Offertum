import { EmailProvider } from '@/generated/prisma/enums';
import { buildRawMessageAIInput } from '@/lib/email/raw-message-ai-input';
import { describe, expect, it } from '@jest/globals';

function encodeGmailBody(value: string): string {
	return Buffer.from(value, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

describe('buildRawMessageAIInput', () => {
	it('extracts nested Gmail text/plain MIME parts', () => {
		const input = buildRawMessageAIInput({
			provider: EmailProvider.GMAIL,
			subject: 'Offerte aanvraag',
			fromName: 'Alice',
			fromEmail: 'alice@example.com',
			raw: {
				payload: {
					mimeType: 'multipart/alternative',
					parts: [
						{
							mimeType: 'text/plain',
							body: { data: encodeGmailBody('Hallo,\n\nGraag ontvang ik een offerte.') }
						}
					]
				}
			}
		});

		expect(input).toEqual({
			subject: 'Offerte aanvraag',
			fromName: 'Alice',
			fromEmail: 'alice@example.com',
			bodyText: 'Hallo,\n\nGraag ontvang ik een offerte.'
		});
	});

	it('falls back to Gmail text/html when no plain text part exists', () => {
		const input = buildRawMessageAIInput({
			provider: EmailProvider.GMAIL,
			subject: null,
			fromName: null,
			fromEmail: null,
			raw: {
				payload: {
					mimeType: 'text/html',
					body: { data: encodeGmailBody('<p>Offerte &amp; planning graag</p><p>Geen haast.</p>') }
				}
			}
		});

		expect(input.bodyText).toBe('Offerte & planning graag\nGeen haast.');
	});

	it('extracts Microsoft HTML bodies and decodes common entities', () => {
		const input = buildRawMessageAIInput({
			provider: EmailProvider.MICROSOFT,
			subject: null,
			fromName: null,
			fromEmail: null,
			raw: {
				bodyPreview: 'ignored when full body exists',
				body: {
					contentType: 'html',
					content: '<div>Nieuwe aanvraag&nbsp;voor CV-ketel &amp; leidingwerk</div>'
				}
			}
		});

		expect(input.bodyText).toBe('Nieuwe aanvraag voor CV-ketel & leidingwerk');
	});
});

import { EmailProvider } from '@/generated/prisma/enums';
import { detectBulkMail } from '@/lib/email/bulk-mail-filter';
import { describe, expect, it } from '@jest/globals';

function encodeGmailBody(value: string): string {
	return Buffer.from(value, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

describe('detectBulkMail', () => {
	it('flags Gmail messages with a non-empty List-Unsubscribe header', () => {
		const result = detectBulkMail({
			provider: EmailProvider.GMAIL,
			raw: {
				payload: {
					headers: [
						{ name: 'From', value: 'newsletter@vendor.example' },
						{ name: 'List-Unsubscribe', value: '<mailto:unsub@vendor.example>' }
					]
				}
			}
		});
		expect(result).toEqual({ isBulk: true, reason: 'list_unsubscribe_header' });
	});

	it('flags Microsoft messages with List-Unsubscribe in internetMessageHeaders', () => {
		const result = detectBulkMail({
			provider: EmailProvider.MICROSOFT,
			raw: {
				internetMessageHeaders: [{ name: 'List-Unsubscribe', value: '<https://vendor.example/unsub?u=123>' }],
				body: { contentType: 'text', content: 'irrelevant' }
			}
		});
		expect(result).toEqual({ isBulk: true, reason: 'list_unsubscribe_header' });
	});

	it('flags bodies containing an unsubscribe phrase (Dutch or English)', () => {
		const englishResult = detectBulkMail({
			provider: EmailProvider.MICROSOFT,
			raw: {
				body: {
					contentType: 'html',
					content:
						'<p>Some marketing copy</p><a href="https://x.example/u">click here to remove yourself from our emails list</a>'
				}
			}
		});
		expect(englishResult).toEqual({ isBulk: true, reason: 'body_unsubscribe_phrase' });

		const dutchResult = detectBulkMail({
			provider: EmailProvider.MICROSOFT,
			raw: {
				body: {
					contentType: 'html',
					content: '<p>Marketing copy</p><a href="https://x.example/u">Uitschrijven</a>'
				}
			}
		});
		expect(dutchResult).toEqual({ isBulk: true, reason: 'body_unsubscribe_phrase' });
	});

	it('flags bodies with two or more tracking-domain links', () => {
		const result = detectBulkMail({
			provider: EmailProvider.MICROSOFT,
			raw: {
				body: {
					contentType: 'html',
					content: '<a href="https://bit.ly/abc">CTA</a><a href="https://mailchi.mp/xyz">More</a>'
				}
			}
		});
		expect(result.isBulk).toBe(true);
		expect(result.reason).toBe('tracking_link_density');
	});

	it('does NOT flag a single tracking link (real customers occasionally use bit.ly too)', () => {
		const result = detectBulkMail({
			provider: EmailProvider.MICROSOFT,
			raw: {
				body: {
					contentType: 'text',
					content: 'Hi, can you send me a quote? Reference site: https://bit.ly/our-project'
				}
			}
		});
		expect(result).toEqual({ isBulk: false, reason: null });
	});

	it('does NOT flag a plain customer message with no bulk signals', () => {
		const result = detectBulkMail({
			provider: EmailProvider.MICROSOFT,
			raw: {
				body: {
					contentType: 'text',
					content: 'Goedemiddag, wij willen graag een offerte ontvangen voor een nieuwe CV-ketel.'
				}
			}
		});
		expect(result).toEqual({ isBulk: false, reason: null });
	});

	it('does NOT count regular domains that contain a tracking domain as substring', () => {
		const result = detectBulkMail({
			provider: EmailProvider.MICROSOFT,
			raw: {
				body: {
					contentType: 'text',
					content:
						'Meeting link: https://teams.microsoft.com/l/meetup/123 and docs at https://support.microsoft.com/page'
				}
			}
		});
		expect(result).toEqual({ isBulk: false, reason: null });
	});

	it('does NOT let a single tracking link cross the threshold by matching multiple rules', () => {
		// click.list-manage.com matches both the click. prefix rule and the list-manage.com domain rule.
		const result = detectBulkMail({
			provider: EmailProvider.MICROSOFT,
			raw: {
				body: {
					contentType: 'text',
					content: 'Bekijk het hier: https://click.list-manage.com/track/abc'
				}
			}
		});
		expect(result).toEqual({ isBulk: false, reason: null });
	});

	it('counts subdomains of tracking domains and ESP click/track redirect hosts', () => {
		const result = detectBulkMail({
			provider: EmailProvider.MICROSOFT,
			raw: {
				body: {
					contentType: 'text',
					content: 'https://us1.list-manage.com/u/abc and https://click.vendor.example/c/def'
				}
			}
		});
		expect(result).toEqual({ isBulk: true, reason: 'tracking_link_density' });
	});

	it('ignores unsubscribe phrases inside quoted reply content', () => {
		const result = detectBulkMail({
			provider: EmailProvider.MICROSOFT,
			raw: {
				body: {
					contentType: 'text',
					content: [
						'Goedemiddag, naar aanleiding van uw nieuwsbrief wil ik graag een offerte voor een dakkapel.',
						'',
						'Op 3 juni 2026 schreef Bouwbedrijf Jansen <nieuwsbrief@jansen.example>:',
						'> Zomeractie! Vraag nu een offerte aan.',
						'> Uitschrijven: klik hier om u af te melden.'
					].join('\n')
				}
			}
		});
		expect(result).toEqual({ isBulk: false, reason: null });
	});

	it('ignores tracking links inside quoted reply content', () => {
		const result = detectBulkMail({
			provider: EmailProvider.MICROSOFT,
			raw: {
				body: {
					contentType: 'text',
					content: [
						'Kunt u mij een offerte sturen voor het schilderwerk?',
						'',
						'> Bekijk de actie: https://bit.ly/actie-juni',
						'> Of hier: https://mailchi.mp/jansen/zomer'
					].join('\n')
				}
			}
		});
		expect(result).toEqual({ isBulk: false, reason: null });
	});

	it('still flags unsubscribe phrases in the sender own (unquoted) text', () => {
		const result = detectBulkMail({
			provider: EmailProvider.MICROSOFT,
			raw: {
				body: {
					contentType: 'text',
					content: 'Speciale aanbieding deze week! Uitschrijven kan onderaan deze mail.'
				}
			}
		});
		expect(result).toEqual({ isBulk: true, reason: 'body_unsubscribe_phrase' });
	});

	it('finds bulk phrases inside Gmail multi-part base64-encoded bodies', () => {
		const result = detectBulkMail({
			provider: EmailProvider.GMAIL,
			raw: {
				payload: {
					mimeType: 'multipart/alternative',
					parts: [
						{
							mimeType: 'text/plain',
							body: {
								data: encodeGmailBody(
									'Aanbieding voor isolatie\n\nKlik hier om u uit te schrijven (unsubscribe)'
								)
							}
						}
					]
				}
			}
		});
		expect(result).toEqual({ isBulk: true, reason: 'body_unsubscribe_phrase' });
	});
});

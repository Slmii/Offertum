import dedent from 'dedent';

interface EmailShellInput {
	subject: string;
	heading: string;
	preheader: string;
	bodyParagraphs: ReadonlyArray<string>;
	cta?: { label: string; url: string };
	footnote?: string;
}

export interface RenderedEmail {
	subject: string;
	html: string;
	text: string;
}

// Shared HTML/text shell for every notification email so visual treatment stays
// consistent and edits to the wrapper land everywhere at once. Inter for body,
// Playfair Display for the heading; rounded 6px CTA in Investment Indigo.
export function renderNotificationEmail(input: EmailShellInput): RenderedEmail {
	const { subject, heading, preheader, bodyParagraphs, cta, footnote } = input;

	const text = dedent`
		${heading}

		${bodyParagraphs.join('\n\n')}

		${cta ? `${cta.label}: ${cta.url}` : ''}

		${footnote ?? ''}
	`;

	const ctaHtml = cta
		? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top: 8px;">
				<tr>
					<td style="background: #1A237E; border-radius: 6px;">
						<a href="${cta.url}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 12px 28px; color: #ffffff; text-decoration: none; font-weight: 500; font-size: 15px;">${cta.label}</a>
					</td>
				</tr>
			</table>`
		: '';

	const paragraphsHtml = bodyParagraphs
		.map(p => `<p style="margin: 0 0 16px; font-size: 15px; line-height: 1.55; color: #262A40;">${p}</p>`)
		.join('');

	const html = dedent`
		<!DOCTYPE html>
		<html lang="nl">
			<head>
				<meta charset="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<title>${subject}</title>
			</head>
			<body style="margin: 0; padding: 0; background: #FBFBFD; font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #0B0E22;">
				<span style="display: none; max-height: 0; overflow: hidden;">${preheader}</span>
				<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background: #FBFBFD; padding: 40px 16px;">
					<tr>
						<td align="center">
							<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="520" style="max-width: 520px; width: 100%; background: #ffffff; border: 1px solid #E1E3EB; border-radius: 6px;">
								<tr>
									<td style="padding: 40px;">
										<h1 style="margin: 0 0 20px; font-family: 'Playfair Display', Georgia, serif; font-size: 26px; font-weight: 600; letter-spacing: -0.01em; color: #0B0E22;">
											${heading}
										</h1>
										${paragraphsHtml}
										${ctaHtml}
										${footnote ? `<hr style="margin: 32px 0; border: 0; border-top: 1px solid #E1E3EB;" /><p style="margin: 0; font-size: 13px; line-height: 1.5; color: #555A70;">${footnote}</p>` : ''}
									</td>
								</tr>
							</table>
							<p style="margin: 24px 0 0; font-size: 12px; line-height: 1.4; color: #8E93A6;">
								Quoteom &middot; offerte management voor SMBs
							</p>
						</td>
					</tr>
				</table>
			</body>
		</html>
	`;

	return { subject, html, text };
}

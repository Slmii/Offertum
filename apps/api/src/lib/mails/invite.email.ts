import dedent from 'dedent';

interface InviteEmail {
	subject: string;
	html: string;
	text: string;
}

export function buildInviteEmail(input: { url: string; organizationName: string }): InviteEmail {
	const { url, organizationName } = input;
	const subject = `Invitation: ${organizationName} on Offertum`;

	const text = dedent`
		You've been invited to join ${organizationName} on Offertum.

		Accept your invitation via this link:

		${url}

		This link expires in 7 days.
	`;

	const html = dedent`
		<!DOCTYPE html>
		<html lang="en">
			<head>
				<meta charset="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<title>${subject}</title>
			</head>
			<body style="margin: 0; padding: 0; background: #fafaf7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #0f172a;">
				<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background: #fafaf7; padding: 40px 16px;">
					<tr>
						<td align="center">
							<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="480" style="max-width: 480px; width: 100%; background: #ffffff; border: 1px solid #e7e5e0; border-radius: 8px;">
								<tr>
									<td style="padding: 40px;">
										<h1 style="margin: 0 0 16px; font-family: 'Playfair Display', Georgia, 'Times New Roman', serif; font-size: 28px; font-weight: 600; letter-spacing: -0.02em; color: #0f172a;">
											Welcome to ${organizationName}
										</h1>
										<p style="margin: 0 0 24px; font-size: 15px; line-height: 1.5; color: #475569;">
											You've been invited to join <strong>${organizationName}</strong> on Offertum. Click the button below to accept your invitation.
										</p>
										<table role="presentation" cellpadding="0" cellspacing="0" border="0">
											<tr>
												<td style="background: #1e293b; border-radius: 6px;">
													<a href="${url}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 12px 28px; color: #ffffff; text-decoration: none; font-weight: 500; font-size: 15px;">Accept invitation</a>
												</td>
											</tr>
										</table>
										<p style="margin: 28px 0 0; font-size: 13px; line-height: 1.5; color: #64748b;">
											Or copy this link into your browser:
										</p>
										<p style="margin: 8px 0 0; font-size: 12px; line-height: 1.4; color: #64748b; word-break: break-all;">
											<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: #d97706; text-decoration: none;">${url}</a>
										</p>
										<hr style="margin: 32px 0; border: 0; border-top: 1px solid #e7e5e0;" />
										<p style="margin: 0; font-size: 13px; line-height: 1.5; color: #64748b;">
											This invitation expires in 7 days. If you didn't expect this email, you can safely ignore it.
										</p>
									</td>
								</tr>
							</table>
							<p style="margin: 24px 0 0; font-size: 12px; line-height: 1.4; color: #94a3b8;">
								Offertum &middot; quote management for SMBs
							</p>
						</td>
					</tr>
				</table>
			</body>
		</html>
	`;

	return { subject, html, text };
}

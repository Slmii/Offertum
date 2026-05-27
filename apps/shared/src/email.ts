/**
 * Email provider tag. Mirrors Prisma's `EmailProvider` enum — declared here as a string
 * union (not re-exported from Prisma) for the same reason as `MembershipRole`: keep the
 * Prisma runtime out of the web bundle.
 */
export type EmailProvider = 'GMAIL' | 'MICROSOFT';

/**
 * `GET /api/email/gmail/status` and `GET /api/email/microsoft/status` response shape.
 * Identical between providers — the BE DTOs (`GmailStatusResponseDto`, `MicrosoftStatusResponseDto`)
 * both implement this interface.
 */
export interface MailboxStatus {
	connected: boolean;
	/** Mailbox address when connected; `null` otherwise. */
	email: string | null;
	/** ISO timestamp when the OAuth handshake completed; `null` otherwise. */
	connectedAt: string | null;
}

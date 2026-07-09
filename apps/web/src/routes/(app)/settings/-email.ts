import type { EmailProvider, MailboxStatus } from '@offertum/shared';

export type MailboxRowStatus = 'connected' | 'disconnected';

/**
 * Provider-section view-model. `provider` is the wire enum; `label` + `connectUrl` are the
 * provider-specific bits the production page supplies. `accounts` is capped at one row today.
 */
export interface MailboxRowView {
	id: string;
	provider: EmailProvider;
	email: string;
	connectedAt: string | null;
	status: MailboxRowStatus;
	error?: string;
}

export function toMailboxRows(provider: EmailProvider, status: MailboxStatus): MailboxRowView[] {
	if (!status.connected || !status.email) {
		return [];
	}

	return [
		{
			id: `${provider}:${status.email}`,
			provider,
			email: status.email,
			connectedAt: status.connectedAt,
			status: 'connected'
		}
	];
}

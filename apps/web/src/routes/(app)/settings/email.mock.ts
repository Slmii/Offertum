import type { EmailProvider, MailboxStatus } from '@offertum/shared';

/**
 * MOCK / DESIGN-FIDELITY LAYER for the Settings — Email accounts surface.
 *
 * The design (`ProviderSection` → stacked `MailboxRow`s) models capabilities the current
 * backend does NOT support. This module is the single, clearly-separated home for those
 * design-only fields so the production wiring below stays honest about what's real.
 *
 * Backend reality (do NOT remove without an API change):
 *  - ONE mailbox per provider per user. `findEmailAccount` + `MailboxStatus` model a single
 *    connection, so the design's `accounts[]` array always has length 0 or 1 today.
 *  - `MailboxStatus` exposes only `{ connected, email, connectedAt }`. There is NO `lastSync`
 *    field and NO degraded/"Verbroken" (connected-but-erroring) state — a disconnected
 *    account simply reports `connected: false` with `email: null`.
 *
 * What is mocked here, and why it is safe:
 *  - `lastSync`: derived placeholder text. There is no API source; shown as design metadata.
 *    Swap for a real `lastSyncAt` on `MailboxStatus` when the backend grows one.
 *  - The "Verbroken" badge + per-row error Alert: representable by the row view-model
 *    (`status: 'disconnected'` + `error`), but the real API can never currently produce a
 *    connected row in an error state, so production rendering only ever yields 'connected'.
 *    The shape is kept so the degraded state is one backend field away from going live.
 */

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
	// MOCK: no API source for the last delta-sync timestamp yet — design metadata only.
	lastSync: string;
	// MOCK: degraded-state copy. Always undefined from the real API today (see module doc).
	error?: string;
}

/**
 * MOCK constant — the placeholder "Laatste sync" copy. Centralised so it reads as obviously
 * non-production. Replace the whole field with a formatted real timestamp once the API ships one.
 */
export const MOCK_LAST_SYNC_LABEL = 'enkele minuten geleden';

/**
 * Maps a real `MailboxStatus` to the design's row view-model. Returns at most one row (the
 * backend models a single mailbox per provider). `lastSync` is mock-filled; the row is only
 * ever 'connected' in production because the API has no degraded state to report.
 */
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
			status: 'connected',
			lastSync: MOCK_LAST_SYNC_LABEL
		}
	];
}

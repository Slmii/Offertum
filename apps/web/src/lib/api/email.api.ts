import { serverFetch } from '@/lib/api/server-fetch';
import { createServerFn } from '@tanstack/react-start';

export interface GmailStatus {
	connected: boolean;
	email: string | null;
	connectedAt: string | null;
}

export interface GmailMessage {
	id: string;
	threadId: string;
	internalDate: string;
	snippet: string;
	subject: string | null;
	from: string | null;
}

export interface GmailMessages {
	messages: GmailMessage[];
	/**
	 * `true` when the server returned 404 — i.e. the EmailAccount row was self-healed
	 * away (revoked at Google) at the moment of this fetch. The status query may still
	 * report `connected: true` because it runs in parallel and was answered before the
	 * deletion. Page should trust this signal AND invalidate the status query.
	 */
	disconnected: boolean;
}

export const getGmailStatusServer = createServerFn({ method: 'GET' }).handler(async (): Promise<GmailStatus> => {
	const response = await serverFetch('/api/email/gmail/status');
	if (!response.ok) {
		throw new Error(`Failed to load Gmail status (${response.status})`);
	}
	return (await response.json()) as GmailStatus;
});

export const getGmailMessagesServer = createServerFn({ method: 'GET' }).handler(async (): Promise<GmailMessages> => {
	const response = await serverFetch('/api/email/gmail/messages');
	if (!response.ok) {
		// 404: either the user never connected, OR `withFreshAccessToken` just self-healed
		// a revoked account away mid-request. Either way we render the same UI — surface
		// the `disconnected: true` flag so the page can reconcile with a stale-but-cached
		// "connected" status response.
		if (response.status === 404) {
			return { messages: [], disconnected: true };
		}

		throw new Error(`Failed to load Gmail messages (${response.status})`);
	}

	const data = (await response.json()) as { messages: GmailMessage[] };
	return { messages: data.messages, disconnected: false };
});

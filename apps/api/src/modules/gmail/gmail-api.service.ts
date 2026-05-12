import { GMAIL_API_BASE } from '@/modules/gmail/gmail.constants';
import { GmailUnauthorizedException } from '@/modules/gmail/oauth-errors';
import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';

export interface GmailMessageHeader {
	name: string;
	value: string;
}

export interface GmailMessageStub {
	id: string;
	threadId: string;
}

export interface GmailMessageMetadata extends GmailMessageStub {
	internalDate: string;
	snippet: string;
	subject: string | null;
	from: string | null;
}

/**
 * Minimal Gmail v1 client. Wraps the two endpoints W3.1 needs:
 *   - users.messages.list  → recent message IDs
 *   - users.messages.get   → metadata for displaying subject/from in the smoke UI
 *
 * W3.4 backfill will need full-message fetches (format=raw or format=full) — extend
 * this service then. For now keep the surface small.
 */
@Injectable()
export class GmailApiService {
	private readonly logger = new Logger(GmailApiService.name);

	/** List the most recent N message IDs for the authenticated user's mailbox. */
	async listRecentMessages(accessToken: string, maxResults: number): Promise<GmailMessageStub[]> {
		const url = `${GMAIL_API_BASE}/users/me/messages?maxResults=${maxResults}`;
		const response = await fetch(url, {
			headers: { authorization: `Bearer ${accessToken}` }
		});

		if (response.status === 401) {
			// Access token was valid on our cached-expiry side but Google has revoked it
			// upstream (typically: user removed our app from myaccount.google.com). Throw
			// the typed exception so `withFreshAccessToken` can force-refresh + retry.
			throw new GmailUnauthorizedException();
		}

		if (!response.ok) {
			const text = await response.text();
			this.logger.error(`messages.list failed: ${response.status} ${text}`);
			throw new InternalServerErrorException('Gmail API messages.list failed');
		}

		const data = (await response.json()) as { messages?: GmailMessageStub[]; resultSizeEstimate?: number };
		return data.messages ?? [];
	}

	/**
	 * Fetch metadata for one message. `format=metadata` keeps the response small —
	 * we only need a few headers (subject, from) and the snippet for the smoke UI.
	 */
	async getMessageMetadata(accessToken: string, id: string): Promise<GmailMessageMetadata> {
		const url = `${GMAIL_API_BASE}/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`;
		const response = await fetch(url, {
			headers: { authorization: `Bearer ${accessToken}` }
		});

		if (response.status === 401) {
			throw new GmailUnauthorizedException();
		}

		if (!response.ok) {
			const text = await response.text();
			this.logger.error(`messages.get failed: ${response.status} ${text}`);
			throw new InternalServerErrorException('Gmail API messages.get failed');
		}

		const data = (await response.json()) as {
			id: string;
			threadId: string;
			internalDate: string;
			snippet: string;
			payload?: { headers?: GmailMessageHeader[] };
		};

		const headers = data.payload?.headers ?? [];
		const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value ?? null;
		const from = headers.find(h => h.name.toLowerCase() === 'from')?.value ?? null;

		return {
			id: data.id,
			threadId: data.threadId,
			internalDate: data.internalDate,
			snippet: data.snippet,
			subject,
			from
		};
	}
}

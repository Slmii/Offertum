import { EmailProvider } from '@/generated/prisma/enums';

/**
 * Pull the `Message-Id` + `References` headers out of a stored `RawMessage.raw`
 * payload. Both providers store the original mail's headers in their own shape:
 *
 *  - **Gmail**: `payload.headers: Array<{ name, value }>`. We scan for `Message-ID` /
 *    `In-Reply-To` / `References` (case-insensitive — Gmail tends to title-case but
 *    other clients vary).
 *  - **Microsoft Graph**: top-level `internetMessageId` for the current message's id,
 *    and `internetMessageHeaders: Array<{ name, value }>` for the rest. The
 *    `internetMessageHeaders` array is only present when `$select` includes it, which
 *    our backfill does — see `microsoft-graph-api.service.ts:buildInitialDeltaUrl`.
 *
 * Returns `{ messageId: null, references: null }` when nothing is parseable. The send
 * code path will then send without threading headers — the reply lands as a new
 * top-level email rather than threaded. Worse UX but not a hard failure.
 */
export interface ExtractedReplyHeaders {
	/** `Message-ID` of the customer's original email — becomes our `In-Reply-To`. */
	messageId: string | null;
	/** Accumulated `References` chain from the original. Caller will append `messageId`. */
	references: string | null;
}

export function extractReplyHeaders(input: { provider: EmailProvider; raw: unknown }): ExtractedReplyHeaders {
	switch (input.provider) {
		case EmailProvider.GMAIL:
			return extractFromGmail(input.raw);
		case EmailProvider.MICROSOFT:
			return extractFromGraph(input.raw);
	}
}

function extractFromGmail(raw: unknown): ExtractedReplyHeaders {
	if (!isPlainObject(raw)) {
		return { messageId: null, references: null };
	}
	const payload = (raw as { payload?: unknown }).payload;
	if (!isPlainObject(payload)) {
		return { messageId: null, references: null };
	}
	const headers = (payload as { headers?: unknown }).headers;
	if (!Array.isArray(headers)) {
		return { messageId: null, references: null };
	}

	let messageId: string | null = null;
	let references: string | null = null;
	for (const header of headers) {
		if (!isPlainObject(header)) {
			continue;
		}
		const name = typeof (header as { name?: unknown }).name === 'string' ? (header as { name: string }).name : '';
		const value =
			typeof (header as { value?: unknown }).value === 'string' ? (header as { value: string }).value : '';
		if (!name || !value) {
			continue;
		}
		const normalized = name.toLowerCase();
		if (normalized === 'message-id' && messageId === null) {
			messageId = value.trim();
		} else if (normalized === 'references' && references === null) {
			references = value.trim();
		}
	}
	return { messageId, references };
}

function extractFromGraph(raw: unknown): ExtractedReplyHeaders {
	if (!isPlainObject(raw)) {
		return { messageId: null, references: null };
	}

	const messageIdRaw = (raw as { internetMessageId?: unknown }).internetMessageId;
	const messageId = typeof messageIdRaw === 'string' && messageIdRaw.trim().length > 0 ? messageIdRaw.trim() : null;

	let references: string | null = null;
	const headers = (raw as { internetMessageHeaders?: unknown }).internetMessageHeaders;
	if (Array.isArray(headers)) {
		for (const header of headers) {
			if (!isPlainObject(header)) {
				continue;
			}
			const name =
				typeof (header as { name?: unknown }).name === 'string' ? (header as { name: string }).name : '';
			const value =
				typeof (header as { value?: unknown }).value === 'string' ? (header as { value: string }).value : '';
			if (name.toLowerCase() === 'references' && value.trim().length > 0) {
				references = value.trim();
				break;
			}
		}
	}

	return { messageId, references };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

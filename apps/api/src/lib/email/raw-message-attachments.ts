import { INBOUND_ATTACHMENT_RETRYABLE, INBOUND_ATTACHMENT_TOO_LARGE } from '@/lib/errors';
const MAX_MIME_DEPTH = 20;

export interface InboundAttachmentMeta {
	providerAttachmentId: string;
	filename: string;
	mimeType: string; // lowercased; '' when unknown
	sizeBytes: number | null;
	isInline: boolean;
}

interface GmailPartHeader {
	name?: unknown;
	value?: unknown;
}

interface GmailAttachmentPart {
	mimeType?: unknown;
	filename?: unknown;
	headers?: unknown;
	body?: { attachmentId?: unknown; size?: unknown };
	parts?: unknown;
}

/**
 * Walk a persisted Gmail `users.messages.get?format=full` payload (see `GmailFullMessage`
 * in `gmail-api.service.ts`) and collect every MIME part that carries an `attachmentId`.
 * Recursion is capped at `MAX_MIME_DEPTH` (same cap `raw-message-ai-input.ts` uses for
 * body-text extraction) so a pathological/malformed payload can't blow the stack.
 * Never throws — malformed input (null, arrays, wrong field types) just yields [].
 */
export function listGmailAttachmentsFromRaw(raw: unknown): InboundAttachmentMeta[] {
	const message = asRecord(raw) as { payload?: unknown } | null;
	if (!message) {
		return [];
	}

	const results: InboundAttachmentMeta[] = [];
	collectGmailAttachments(message.payload, results, 0);
	return results;
}

function collectGmailAttachments(payload: unknown, results: InboundAttachmentMeta[], depth: number): void {
	const part = asRecord(payload) as GmailAttachmentPart | null;
	if (!part || depth > MAX_MIME_DEPTH) {
		return;
	}

	const filename = typeof part.filename === 'string' ? part.filename : '';
	const attachmentId = typeof part.body?.attachmentId === 'string' ? part.body.attachmentId : '';

	if (filename.length > 0 && attachmentId.length > 0) {
		const mimeType = typeof part.mimeType === 'string' ? part.mimeType.toLowerCase() : '';
		const size = part.body?.size;
		const sizeBytes = typeof size === 'number' && Number.isFinite(size) ? size : null;

		results.push({
			providerAttachmentId: attachmentId,
			filename,
			mimeType,
			sizeBytes,
			isInline: isGmailPartInline(part, mimeType)
		});
	}

	if (!Array.isArray(part.parts)) {
		return;
	}

	for (const nested of part.parts) {
		collectGmailAttachments(nested, results, depth + 1);
	}
}

function isGmailPartInline(part: GmailAttachmentPart, mimeType: string): boolean {
	if (!Array.isArray(part.headers)) {
		return false;
	}

	let hasContentId = false;
	for (const header of part.headers) {
		const h = asRecord(header) as GmailPartHeader | null;
		if (!h || typeof h.name !== 'string' || typeof h.value !== 'string') {
			continue;
		}
		const name = h.name.toLowerCase();
		if (name === 'content-disposition' && h.value.trim().toLowerCase().startsWith('inline')) {
			return true;
		}
		if (name === 'content-id') {
			hasContentId = true;
		}
	}

	return hasContentId && mimeType.startsWith('image/');
}

/**
 * `raw` is a persisted Microsoft Graph message. Returns the stored `hasAttachments`
 * boolean when present, or `null` when the field is absent (rows persisted before the
 * `$select` was extended to include it) — callers treat `null` as "unknown, go check."
 */
export function hasMicrosoftAttachments(raw: unknown): boolean | null {
	const message = asRecord(raw) as { hasAttachments?: unknown } | null;
	if (!message) {
		return null;
	}

	return typeof message.hasAttachments === 'boolean' ? message.hasAttachments : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return null;
	}

	return value as Record<string, unknown>;
}

/** Bounds a provider download. `maxBytes` is the DECODED size we are willing to hold. */
export interface InboundAttachmentDownloadLimits {
	maxBytes: number;
	timeoutMs: number;
}

/**
 * Thrown by the provider layer when a response announces more bytes than we will accept, so
 * it can be refused BEFORE it is buffered. Provider metadata can omit the size (`sizeBytes`
 * is nullable), and the pre-download check cannot help with those.
 */
export class InboundAttachmentTooLargeError extends Error {
	constructor() {
		super(INBOUND_ATTACHMENT_TOO_LARGE);
		this.name = 'InboundAttachmentTooLargeError';
	}
}

/**
 * A provider call failed in a way that is worth trying again (network blip, 429, timeout).
 * This is the ONE error the attachment service lets escape into the pipeline, deliberately:
 * the pipeline's catch leaves the RawMessage unclassified, so the next run retries it. Simply
 * degrading instead would let the message be classified without its attachment — and a
 * classified message is never scanned again, so for a "zie bijlage" mail one network blip
 * would lose the lead for good.
 */
export class InboundAttachmentRetryableError extends Error {
	constructor() {
		super(INBOUND_ATTACHMENT_RETRYABLE);
		this.name = 'InboundAttachmentRetryableError';
	}
}

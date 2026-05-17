import { EmailProvider } from '@/generated/prisma/enums';
import type { ClassifierInput } from '@/modules/ai/classifier/classifier.types';

const MAX_MIME_DEPTH = 20;

export interface RawMessageAIInputSource {
	provider: EmailProvider;
	subject: string | null;
	fromName: string | null;
	fromEmail: string | null;
	raw: unknown;
}

interface GmailPayload {
	mimeType?: unknown;
	body?: { data?: unknown };
	parts?: unknown;
}

interface GmailRawMessage {
	snippet?: unknown;
	payload?: GmailPayload;
}

interface MicrosoftRawMessage {
	bodyPreview?: unknown;
	body?: {
		contentType?: unknown;
		content?: unknown;
	};
}

interface GmailBodyBuckets {
	plain: string[];
	html: string[];
}

export function buildRawMessageAIInput(source: RawMessageAIInputSource): ClassifierInput {
	return {
		subject: source.subject,
		fromName: source.fromName,
		fromEmail: source.fromEmail,
		bodyText: extractBodyText(source)
	};
}

function extractBodyText(source: RawMessageAIInputSource): string {
	if (source.provider === EmailProvider.GMAIL) {
		return extractGmailBodyText(source.raw);
	}

	return extractMicrosoftBodyText(source.raw);
}

function extractGmailBodyText(raw: unknown): string {
	const message = asRecord(raw) as GmailRawMessage | null;
	if (!message) {
		return '';
	}

	const buckets: GmailBodyBuckets = { plain: [], html: [] };
	collectGmailBodyParts(message.payload, buckets, 0);

	if (buckets.plain.length > 0) {
		return normalizeText(buckets.plain.join('\n\n'));
	}

	if (buckets.html.length > 0) {
		return normalizeText(stripHtmlToText(buckets.html.join('\n\n')));
	}

	return normalizeText(typeof message.snippet === 'string' ? message.snippet : '');
}

function collectGmailBodyParts(payload: GmailPayload | undefined, buckets: GmailBodyBuckets, depth: number): void {
	if (!payload || depth > MAX_MIME_DEPTH) {
		return;
	}

	const mimeType = typeof payload.mimeType === 'string' ? payload.mimeType.toLowerCase() : '';
	const data = typeof payload.body?.data === 'string' ? decodeBase64Url(payload.body.data) : '';

	if (data && mimeType === 'text/plain') {
		buckets.plain.push(data);
	}

	if (data && mimeType === 'text/html') {
		buckets.html.push(data);
	}

	if (!Array.isArray(payload.parts)) {
		return;
	}

	for (const part of payload.parts) {
		const nested = asRecord(part) as GmailPayload | null;
		if (nested) {
			collectGmailBodyParts(nested, buckets, depth + 1);
		}
	}
}

function extractMicrosoftBodyText(raw: unknown): string {
	const message = asRecord(raw) as MicrosoftRawMessage | null;
	if (!message) {
		return '';
	}

	const content = typeof message.body?.content === 'string' ? message.body.content : '';
	const contentType = typeof message.body?.contentType === 'string' ? message.body.contentType.toLowerCase() : '';

	if (contentType === 'text') {
		return normalizeText(content);
	}

	if (contentType === 'html') {
		return normalizeText(stripHtmlToText(content));
	}

	return normalizeText(typeof message.bodyPreview === 'string' ? message.bodyPreview : content);
}

function decodeBase64Url(value: string): string {
	const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
	const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
	return Buffer.from(padded, 'base64').toString('utf8');
}

function stripHtmlToText(html: string): string {
	return decodeHtmlEntities(
		html
			.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
			.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
			.replace(/<br\s*\/?>/gi, '\n')
			.replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
			.replace(/<[^>]+>/g, ' ')
	);
}

function decodeHtmlEntities(value: string): string {
	return value
		.replace(/&nbsp;/gi, ' ')
		.replace(/&amp;/gi, '&')
		.replace(/&lt;/gi, '<')
		.replace(/&gt;/gi, '>')
		.replace(/&quot;/gi, '"')
		.replace(/&#39;/g, "'")
		.replace(/&#(\d+);/g, (match, code: string) => decodeCodePoint(Number(code), match))
		.replace(/&#x([0-9a-f]+);/gi, (match, code: string) => decodeCodePoint(Number.parseInt(code, 16), match));
}

function normalizeText(value: string): string {
	return value
		.replace(/\r\n/g, '\n')
		.replace(/[ \t]+/g, ' ')
		.replace(/[ \t]*\n[ \t]*/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

function asRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return null;
	}

	return value as Record<string, unknown>;
}

function decodeCodePoint(codePoint: number, fallback: string): string {
	if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
		return fallback;
	}

	return String.fromCodePoint(codePoint);
}

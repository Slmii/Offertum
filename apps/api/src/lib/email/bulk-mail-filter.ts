import { EmailProvider } from '@/generated/prisma/enums';

/**
 * Heuristic pre-filter that short-circuits the classifier for emails that are
 * unambiguously bulk/marketing — the kind that uses quote-request vocabulary
 * ("offerte aanvragen", "free quotes") to bait clicks but is sent by a vendor, not
 * a prospective customer.
 *
 * Conservative by design: we only mark `isBulk: true` on STRONG signals because a
 * false positive here means dropping a real customer's quote request on the floor —
 * much worse than a few marketing emails sneaking through to the classifier. If you
 * tighten the rules later, run the classifier accuracy harness first to confirm no
 * regression on the positive fixtures.
 */

export interface BulkMailFilterInput {
	provider: EmailProvider;
	raw: unknown;
}

export interface BulkMailFilterResult {
	isBulk: boolean;
	/** Why we decided it's bulk — stored as `metadata.reason` on the skip log. */
	reason:
		| 'list_unsubscribe_header'
		| 'body_unsubscribe_phrase'
		| 'tracking_link_density'
		| 'offertum_notification'
		| null;
}

// Header stamped on every outbound notification email. Inbound RawMessages carrying
// it are Offertum's own emails arriving in a user's connected mailbox — short-circuit
// them before the classifier sees the body (which would otherwise look like a real
// quote request and trigger an infinite create-opp → email → create-opp loop).
export const OFFERTUM_NOTIFICATION_HEADER = 'X-Offertum-Notification';
export const OFFERTUM_NOTIFICATION_HEADER_VALUE = 'true';

const TRACKING_LINK_THRESHOLD = 2;

// Phrases that almost only appear in bulk-mail footers. Lowercased; we match
// case-insensitively against the rendered text. Keep this list signal-dense — generic
// phrases like "click here" alone are NOT enough; the surrounding "unsubscribe" /
// "remove yourself" context is what makes it a bulk-mail tell.
const BULK_FOOTER_PHRASES = [
	'unsubscribe',
	'remove yourself from',
	'remove me from this list',
	'manage your preferences',
	'manage your email preferences',
	'manage subscription',
	'opt out of these emails',
	'uitschrijven',
	'afmelden voor deze e-mails',
	'afmelden van deze mailing',
	'je voorkeuren beheren',
	'verwijder mij van deze lijst'
];

// URL-shortener / tracking domains commonly used by bulk-mail platforms. Two or more
// DISTINCT links pointing at these in one body is a high-confidence "bulk send" signal —
// real one-to-one emails don't usually contain multiple tracking redirects. Matching is
// anchored against the parsed URL host (exact match or subdomain), never a substring
// scan over the body: an unanchored /t\.co/ would match `teams.microsoft.com` and drop a
// real customer's quote request over a signature link.
const TRACKING_DOMAINS = [
	'bit.ly',
	't.co',
	'tinyurl.com',
	'ow.ly',
	'buff.ly',
	'list-manage.com',
	'mailchi.mp',
	'sendgrid.net',
	'hubspotlinks.com',
	'hubspotemail.net'
];

// ESP redirect hosts follow a `click.<brand>.<tld>` / `track.<brand>.<tld>` naming
// convention (click.exacttarget.com, track.customer.io, ...). Anchored to the START of
// the host and requiring at least three labels so `myclick.example.com` or a bare
// two-label host never qualifies.
const TRACKING_HOST_PREFIXES = ['click.', 'track.'];

// Generic email tracking redirect: host `email.<brand>.<tld>` with a `/c/...` path.
const TRACKING_EMAIL_HOST_PREFIX = 'email.';
const TRACKING_EMAIL_REDIRECT_PATH_PREFIX = '/c/';

// Matches http(s) URLs in plain text AND inside HTML attributes/entities. Terminators
// cover whitespace, quotes, angle brackets, and common HTML delimiters.
const URL_PATTERN = /https?:\/\/[^\s<>"'()[\]]+/gi;

// Lines that mark the start of quoted/forwarded content in a reply. Everything below
// the first match is someone ELSE's text (often a newsletter the customer replied on
// top of) — its unsubscribe footer must not get the customer's reply dropped.
const REPLY_SEPARATOR_PATTERNS = [
	/^On .{0,200} wrote:\s*$/i, // Gmail English
	/^Op .{0,200} schreef .{0,200}:\s*$/i, // Gmail Dutch
	/^-{2,}\s*Original Message\s*-{2,}$/i, // Outlook English
	/^-{2,}\s*Oorspronkelijk bericht\s*-{2,}$/i, // Outlook Dutch
	/^Van:\s/, // Dutch forwarded-header block
	/^From:\s/, // English forwarded-header block
	/^_{10,}\s*$/ // Outlook divider line
];

export function detectBulkMail(input: BulkMailFilterInput): BulkMailFilterResult {
	if (hasOffertumNotificationHeader(input)) {
		return { isBulk: true, reason: 'offertum_notification' };
	}

	if (input.provider === EmailProvider.GMAIL && hasGmailListUnsubscribeHeader(input.raw)) {
		return { isBulk: true, reason: 'list_unsubscribe_header' };
	}

	if (input.provider === EmailProvider.MICROSOFT && hasMicrosoftListUnsubscribeHeader(input.raw)) {
		return { isBulk: true, reason: 'list_unsubscribe_header' };
	}

	const body = extractRawBody(input);
	if (!body) {
		return { isBulk: false, reason: null };
	}

	// Only the sender's OWN text counts toward bulk signals — a quoted newsletter
	// below a customer's reply must not get that reply dropped.
	const ownText = stripQuotedContent(body);

	if (containsBulkFooterPhrase(ownText)) {
		return { isBulk: true, reason: 'body_unsubscribe_phrase' };
	}

	if (trackingLinkCount(ownText) >= TRACKING_LINK_THRESHOLD) {
		return { isBulk: true, reason: 'tracking_link_density' };
	}

	return { isBulk: false, reason: null };
}

function hasOffertumNotificationHeader(input: BulkMailFilterInput): boolean {
	const target = OFFERTUM_NOTIFICATION_HEADER.toLowerCase();

	if (input.provider === EmailProvider.GMAIL) {
		const headers = asRecord(input.raw)?.payload as { headers?: unknown } | undefined;
		const headerArray = headers?.headers;
		if (!Array.isArray(headerArray)) {
			return false;
		}
		return headerArray.some(h => {
			const header = asRecord(h);
			const name = typeof header?.name === 'string' ? header.name.toLowerCase() : '';
			return name === target;
		});
	}

	const headers = asRecord(input.raw)?.internetMessageHeaders;
	if (!Array.isArray(headers)) {
		return false;
	}
	return headers.some(h => {
		const header = asRecord(h);
		const name = typeof header?.name === 'string' ? header.name.toLowerCase() : '';
		return name === target;
	});
}

function hasGmailListUnsubscribeHeader(raw: unknown): boolean {
	const headers = asRecord(raw)?.payload as { headers?: unknown } | undefined;
	const headerArray = headers?.headers;
	if (!Array.isArray(headerArray)) {
		return false;
	}
	return headerArray.some(h => {
		const header = asRecord(h);
		const name = typeof header?.name === 'string' ? header.name.toLowerCase() : '';
		const value = typeof header?.value === 'string' ? header.value : '';
		return name === 'list-unsubscribe' && value.trim().length > 0;
	});
}

function hasMicrosoftListUnsubscribeHeader(raw: unknown): boolean {
	const headers = asRecord(raw)?.internetMessageHeaders;
	if (!Array.isArray(headers)) {
		return false;
	}
	return headers.some(h => {
		const header = asRecord(h);
		const name = typeof header?.name === 'string' ? header.name.toLowerCase() : '';
		const value = typeof header?.value === 'string' ? header.value : '';
		return name === 'list-unsubscribe' && value.trim().length > 0;
	});
}

function extractRawBody(input: BulkMailFilterInput): string {
	const record = asRecord(input.raw);
	if (!record) {
		return '';
	}

	if (input.provider === EmailProvider.MICROSOFT) {
		const body = asRecord(record.body);
		const content = typeof body?.content === 'string' ? body.content : '';
		const preview = typeof record.bodyPreview === 'string' ? record.bodyPreview : '';
		return `${content}\n${preview}`;
	}

	// Gmail: walk the (potentially nested) payload bodies. Heuristic doesn't need
	// HTML-stripped clean text — the link/phrase patterns work on raw HTML too.
	const collected: string[] = [];
	const snippet = typeof record.snippet === 'string' ? record.snippet : '';
	if (snippet) {
		collected.push(snippet);
	}
	collectGmailBodySegments(record.payload, collected, 0);
	return collected.join('\n');
}

interface GmailPayload {
	body?: { data?: unknown };
	parts?: unknown;
}

const MAX_MIME_DEPTH = 20;

function collectGmailBodySegments(payload: unknown, sink: string[], depth: number): void {
	if (depth > MAX_MIME_DEPTH) {
		return;
	}
	const node = asRecord(payload) as GmailPayload | null;
	if (!node) {
		return;
	}
	const data = typeof node.body?.data === 'string' ? decodeBase64Url(node.body.data) : '';
	if (data) {
		sink.push(data);
	}
	if (Array.isArray(node.parts)) {
		for (const part of node.parts) {
			collectGmailBodySegments(part, sink, depth + 1);
		}
	}
}

function decodeBase64Url(value: string): string {
	const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
	const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
	return Buffer.from(padded, 'base64').toString('utf8');
}

function containsBulkFooterPhrase(body: string): boolean {
	const lower = body.toLowerCase();
	return BULK_FOOTER_PHRASES.some(phrase => lower.includes(phrase));
}

// Drops quoted/forwarded content: everything below the first reply separator, plus any
// '>'-prefixed quote lines above it.
function stripQuotedContent(body: string): string {
	const lines = body.split('\n');
	const kept: string[] = [];
	for (const line of lines) {
		const trimmed = line.trim();
		if (REPLY_SEPARATOR_PATTERNS.some(pattern => pattern.test(trimmed))) {
			break;
		}
		if (trimmed.startsWith('>')) {
			continue;
		}
		kept.push(line);
	}
	return kept.join('\n');
}

function trackingLinkCount(body: string): number {
	const urls = body.match(URL_PATTERN);
	if (!urls) {
		return 0;
	}

	const distinctTrackingLinks = new Set<string>();
	for (const candidate of urls) {
		// Strip trailing sentence punctuation that the pattern's terminator set lets through.
		const cleaned = candidate.replace(/[.,;:!?]+$/, '');
		let url: URL;
		try {
			url = new URL(cleaned);
		} catch {
			continue;
		}
		if (isTrackingHost(url)) {
			distinctTrackingLinks.add(`${url.hostname}${url.pathname}${url.search}`);
		}
		if (distinctTrackingLinks.size >= TRACKING_LINK_THRESHOLD) {
			break;
		}
	}
	return distinctTrackingLinks.size;
}

function isTrackingHost(url: URL): boolean {
	const host = url.hostname.toLowerCase();

	if (TRACKING_DOMAINS.some(domain => host === domain || host.endsWith(`.${domain}`))) {
		return true;
	}

	const labelCount = host.split('.').length;
	if (labelCount >= 3 && TRACKING_HOST_PREFIXES.some(prefix => host.startsWith(prefix))) {
		return true;
	}

	return (
		labelCount >= 3 &&
		host.startsWith(TRACKING_EMAIL_HOST_PREFIX) &&
		url.pathname.startsWith(TRACKING_EMAIL_REDIRECT_PATH_PREFIX)
	);
}

function asRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return null;
	}
	return value as Record<string, unknown>;
}

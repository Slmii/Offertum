/**
 * W5.5 — RFC 2822 message builder for Gmail's `users.messages.send` endpoint.
 *
 * Gmail's send API requires `raw`: a base64url-encoded RFC 2822 byte stream containing
 * headers + body. For a threaded reply, the `In-Reply-To` + `References` headers are
 * load-bearing: without them the reply lands as a new top-level email in the recipient's
 * client (Gmail/Outlook will display it disconnected from the conversation).
 *
 * Microsoft Graph uses a structured JSON payload (`/me/sendMail`) instead, so this
 * builder is Gmail-only. Graph's threading is handled by the `internetMessageHeaders`
 * array on its message object — see `microsoft-graph-api.service.ts`.
 *
 * Encoding choices:
 *  - UTF-8 throughout (Quoteom's customers write in Dutch, names contain accents).
 *  - `Content-Transfer-Encoding: quoted-printable` would be more "correct" for arbitrary
 *    text but adds complexity for tiny wins; sticking with `8bit` is fine within Gmail's
 *    own outbound pipeline (it re-encodes for SMTP itself if the receiving server is
 *    7-bit-only).
 *  - `Subject` is RFC 2047 encoded-word ("=?UTF-8?B?…?=") only when it contains
 *    non-ASCII — keeps clean subjects readable in raw logs while still safe for accents.
 */

export interface BuildRfc2822ReplyAttachment {
	filename: string;
	contentType: string;
	data: Buffer;
}

export interface BuildRfc2822ReplyInput {
	/** Recipient — typically the customer's email address from `RawMessage.fromEmail`. */
	to: string;
	/** Sender — the connected inbox's email address. */
	from: string;
	/** Sender display name (the connected user's `User.name`). Optional. */
	fromName: string | null;
	/** Subject for the reply — typically `Re: <original subject>`. */
	subject: string;
	/** Plain-text body. The builder adds a UTF-8 / 8bit Content-Type header. */
	body: string;
	/** `Message-Id` of the customer's original message. Required for threading. */
	inReplyTo: string | null;
	/**
	 * Optional accumulated `References` chain. If the original message had a
	 * `References` header, prepend it here; otherwise pass `null` and the builder uses
	 * `inReplyTo` alone (which is correct for a 1-deep reply).
	 */
	references: string | null;
	/**
	 * W5.5 follow-up — files to attach. Empty array means "no attachments" and the
	 * builder emits a plain `text/plain` body (the original W5.5 send path). Any non-
	 * empty array switches to `multipart/mixed` with the body as the first part.
	 */
	attachments?: ReadonlyArray<BuildRfc2822ReplyAttachment>;
}

/**
 * Build the base64url-encoded RFC 2822 string for `users.messages.send`. Returns the
 * encoded payload ready to drop into `{ raw: <encoded> }`.
 *
 * Two output modes depending on `attachments`:
 *  - Empty / undefined → single-part `text/plain; charset=UTF-8` body (the historical
 *    W5.5 shape; unchanged so the no-attachment path stays identical byte-for-byte).
 *  - One or more → `multipart/mixed; boundary=…` envelope: first part is the
 *    text/plain body, subsequent parts are each attachment base64-encoded with a
 *    `Content-Disposition: attachment; filename=…` header. RFC 2047 encoded-word
 *    handles non-ASCII filenames.
 */
export function buildRfc2822Reply(input: BuildRfc2822ReplyInput): string {
	const attachments = input.attachments ?? [];
	const useMultipart = attachments.length > 0;

	const headers: string[] = [
		`From: ${formatFrom(input.from, input.fromName)}`,
		`To: ${input.to}`,
		`Subject: ${encodeSubject(input.subject)}`,
		`MIME-Version: 1.0`
	];

	if (input.inReplyTo) {
		headers.push(`In-Reply-To: ${input.inReplyTo}`);
		// References chain: prepend the historical chain if present, then the current
		// In-Reply-To. Mail clients walk this header to render the thread tree.
		const referencesChain = input.references ? `${input.references} ${input.inReplyTo}` : input.inReplyTo;
		headers.push(`References: ${referencesChain}`);
	}

	if (!useMultipart) {
		headers.push(`Content-Type: text/plain; charset="UTF-8"`);
		headers.push(`Content-Transfer-Encoding: 8bit`);
		// `\r\n` is required per RFC; many clients tolerate `\n` but Gmail rejects
		// malformed raw payloads with a 400. Stick to the spec.
		const message = headers.join('\r\n') + '\r\n\r\n' + input.body;
		return Buffer.from(message, 'utf-8').toString('base64url');
	}

	// Multipart path. Boundary picked at build-time — long enough that a clash with
	// arbitrary attachment bytes is statistically impossible (16 random bytes ≈ 128
	// bits of entropy). RFC 2046 forbids the boundary string from appearing anywhere
	// in the parts.
	const boundary = `=_quoteom_${randomBoundary()}`;
	headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);

	const parts: string[] = [];
	parts.push(
		[
			`--${boundary}`,
			`Content-Type: text/plain; charset="UTF-8"`,
			`Content-Transfer-Encoding: 8bit`,
			'',
			input.body
		].join('\r\n')
	);

	for (const attachment of attachments) {
		const filenameHeader = encodedFilename(attachment.filename);
		const base64Body = wrapBase64(attachment.data.toString('base64'));
		parts.push(
			[
				`--${boundary}`,
				`Content-Type: ${attachment.contentType}; name="${filenameHeader.quotedName}"`,
				`Content-Disposition: attachment; filename="${filenameHeader.quotedName}"${filenameHeader.starParam}`,
				`Content-Transfer-Encoding: base64`,
				'',
				base64Body
			].join('\r\n')
		);
	}

	const envelope = headers.join('\r\n') + '\r\n\r\n' + parts.join('\r\n') + `\r\n--${boundary}--\r\n`;

	return Buffer.from(envelope, 'utf-8').toString('base64url');
}

/**
 * 16 random bytes → hex. Used as a MIME boundary; long enough that the chance of a
 * collision with arbitrary attachment bytes is negligible.
 */
function randomBoundary(): string {
	const bytes = new Uint8Array(16);
	for (let i = 0; i < bytes.length; i++) {
		bytes[i] = Math.floor(Math.random() * 256);
	}
	return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Wrap base64 output at 76 columns per RFC 2045 §6.8. Many mail relays mangle
 * unwrapped base64 over 998 chars; the 76-col convention is the safe choice.
 */
function wrapBase64(b64: string): string {
	const lines: string[] = [];
	for (let i = 0; i < b64.length; i += 76) {
		lines.push(b64.slice(i, i + 76));
	}
	return lines.join('\r\n');
}

/**
 * Build a quoted filename plus an RFC 2231 `filename*=UTF-8''<encoded>` continuation
 * for non-ASCII names. The quoted form is the legacy fallback for older mail clients
 * that don't speak 2231; the `filename*` form is preferred by modern clients and
 * preserves accents end-to-end.
 */
function encodedFilename(filename: string): { quotedName: string; starParam: string } {
	const safeQuoted = filename.replace(/"/g, '').replace(/[\r\n]/g, '');
	if (!containsNonAscii(filename)) {
		return { quotedName: safeQuoted, starParam: '' };
	}
	const encoded = encodeURIComponent(filename);
	return { quotedName: safeQuoted, starParam: `; filename*=UTF-8''${encoded}` };
}

/**
 * Format a `From:` header with optional display name. Quotes the name when it contains
 * characters that would break the RFC syntax (commas, parentheses, etc.). RFC 2047
 * encoded-word for non-ASCII names — handles "Çetingüney" style.
 */
function formatFrom(email: string, name: string | null): string {
	if (!name || name.trim().length === 0) {
		return email;
	}
	const trimmed = name.trim();
	if (containsNonAscii(trimmed)) {
		return `${encodeWord(trimmed)} <${email}>`;
	}
	// Quote when the name contains RFC 5322 specials. Cheap conservative quoting — never
	// quote-overhead-hurts; missing-quotes-breaks-parsers.
	if (/[",.()<>@;:\\[\]]/.test(trimmed)) {
		return `"${trimmed.replace(/(["\\])/g, '\\$1')}" <${email}>`;
	}
	return `${trimmed} <${email}>`;
}

/** RFC 2047 base64 encoded-word for non-ASCII strings in `Subject` / display names. */
function encodeSubject(subject: string): string {
	if (!containsNonAscii(subject)) {
		return subject;
	}
	return encodeWord(subject);
}

function encodeWord(value: string): string {
	const encoded = Buffer.from(value, 'utf-8').toString('base64');
	return `=?UTF-8?B?${encoded}?=`;
}

function containsNonAscii(value: string): boolean {
	// eslint-disable-next-line no-control-regex
	return /[^\x00-\x7F]/.test(value);
}

/**
 * Compose a "Re:" subject for a reply without doubling up on existing `Re:` /
 * `Antw:` / etc. prefixes the original email already had. Case-insensitive match.
 */
export function composeReplySubject(originalSubject: string | null): string {
	const trimmed = originalSubject?.trim();
	if (!trimmed) {
		return 'Re:';
	}
	// Common reply prefixes across mail clients + locales.
	if (/^(re|aw|antw|sv|r):\s/i.test(trimmed)) {
		return trimmed;
	}
	return `Re: ${trimmed}`;
}

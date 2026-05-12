import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Symmetric encryption for sensitive token columns in the `Account` table (OAuth
 * `access_token` / `refresh_token` / `id_token`).
 *
 * - **Algorithm:** AES-256-GCM. Built-in to Node, FIPS-grade, authenticated (the auth tag
 *   detects tampered ciphertext on decrypt).
 * - **Key:** 32 bytes, hex-encoded in `TOKEN_ENCRYPTION_KEY` env. Generate with
 *   `openssl rand -hex 32`. Treat it like a password — losing it makes every encrypted
 *   token unreadable; leaking it makes them readable to anyone with DB access.
 * - **Format:** `v1:<base64(iv ‖ authTag ‖ ciphertext)>`. The `v1` prefix lets us add
 *   a `v2` later (key rotation) without ambiguity — decrypt picks the right key per row.
 *
 * **Why encrypt these specifically:** the OAuth refresh tokens we'll start storing in
 * Week 3 (Gmail + Microsoft Graph) grant long-lived read+send access to a customer's
 * inbox. Plaintext in DB → backup or SQL-injection leak = instant mailbox takeover for
 * every connected customer. Encryption at rest with a separate key turns that into
 * "leak DB + leak env-var key" — much higher bar.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_HEX_LENGTH = 64; // 32 bytes
const CURRENT_VERSION = 'v1';

function getKey(): Buffer {
	const hex = process.env.TOKEN_ENCRYPTION_KEY;
	if (!hex || hex.length !== KEY_HEX_LENGTH) {
		throw new Error(
			'TOKEN_ENCRYPTION_KEY must be a 64-char hex string (32 bytes). ' + 'Generate one with: openssl rand -hex 32'
		);
	}
	return Buffer.from(hex, 'hex');
}

export function encrypt(plain: string): string {
	const key = getKey();
	const iv = randomBytes(IV_BYTES);
	const cipher = createCipheriv(ALGORITHM, key, iv);
	const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();
	const payload = Buffer.concat([iv, tag, ciphertext]).toString('base64');
	return `${CURRENT_VERSION}:${payload}`;
}

export function decrypt(value: string): string {
	const colon = value.indexOf(':');
	if (colon < 0) {
		throw new Error('Encrypted value missing version prefix');
	}

	const version = value.slice(0, colon);
	if (version !== CURRENT_VERSION) {
		throw new Error(`Unsupported token encryption version: ${version}`);
	}

	const buf = Buffer.from(value.slice(colon + 1), 'base64');
	const iv = buf.subarray(0, IV_BYTES);
	const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
	const ciphertext = buf.subarray(IV_BYTES + TAG_BYTES);

	const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
	decipher.setAuthTag(tag);
	return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/** Pass-through helpers — encrypt/decrypt only when the value is present. */
export function maybeEncrypt(plain: string | null | undefined): string | null {
	return plain == null ? null : encrypt(plain);
}

export function maybeDecrypt(value: string | null | undefined): string | null {
	return value == null ? null : decrypt(value);
}

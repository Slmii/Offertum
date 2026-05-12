import { decrypt, encrypt, maybeDecrypt, maybeEncrypt } from '@/lib/crypto/token-encryption';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';

describe('token-encryption', () => {
	const ORIGINAL_KEY = process.env.TOKEN_ENCRYPTION_KEY;

	beforeAll(() => {
		// Deterministic key for tests — 32 bytes of 0xab.
		process.env.TOKEN_ENCRYPTION_KEY = 'ab'.repeat(32);
	});

	afterAll(() => {
		process.env.TOKEN_ENCRYPTION_KEY = ORIGINAL_KEY;
	});

	it('round-trips an ASCII token', () => {
		const plain = 'ya29.a0AfH6SMBExampleAccessToken1234567890';
		const cipher = encrypt(plain);
		expect(cipher.startsWith('v1:')).toBe(true);
		expect(decrypt(cipher)).toBe(plain);
	});

	it('round-trips a unicode token (refresh tokens contain dashes, slashes, plus signs)', () => {
		const plain = '1//0eX-_+/=AbCdEfGhIjKlMnOpQrStUvWxYz';
		expect(decrypt(encrypt(plain))).toBe(plain);
	});

	it('produces a different ciphertext on each call (random IV)', () => {
		const plain = 'same-input';
		expect(encrypt(plain)).not.toBe(encrypt(plain));
	});

	it('rejects tampered ciphertext via GCM auth tag', () => {
		const cipher = encrypt('valid-token');
		// Flip a byte near the end of the payload — should invalidate the auth tag.
		const last = cipher.charAt(cipher.length - 2);
		const flipped = cipher.slice(0, -2) + (last === 'a' ? 'b' : 'a') + cipher.slice(-1);
		expect(() => decrypt(flipped)).toThrow();
	});

	it('rejects unknown version prefix', () => {
		expect(() => decrypt('v99:abc')).toThrow(/Unsupported token encryption version/);
	});

	it('rejects payload missing version prefix', () => {
		expect(() => decrypt('justbase64nocolon')).toThrow(/missing version prefix/);
	});

	it('throws when key is missing', () => {
		const saved = process.env.TOKEN_ENCRYPTION_KEY;
		delete process.env.TOKEN_ENCRYPTION_KEY;
		expect(() => encrypt('x')).toThrow(/TOKEN_ENCRYPTION_KEY must be a 64-char hex/);
		process.env.TOKEN_ENCRYPTION_KEY = saved;
	});

	it('maybeEncrypt / maybeDecrypt pass through null + undefined', () => {
		expect(maybeEncrypt(null)).toBeNull();
		expect(maybeEncrypt(undefined)).toBeNull();
		expect(maybeDecrypt(null)).toBeNull();
		expect(maybeDecrypt(undefined)).toBeNull();
	});

	it('maybeEncrypt / maybeDecrypt round-trip a real value', () => {
		const plain = 'hello';
		const cipher = maybeEncrypt(plain);
		expect(cipher).not.toBeNull();
		expect(maybeDecrypt(cipher)).toBe(plain);
	});

	it('round-trips an empty string', () => {
		// Edge case: GCM still produces a valid 0-byte ciphertext + tag.
		expect(decrypt(encrypt(''))).toBe('');
	});

	it('round-trips a long token (10 KB of ASCII)', () => {
		const plain = 'A'.repeat(10_000);
		const cipher = encrypt(plain);
		expect(decrypt(cipher)).toBe(plain);
		// Ciphertext overhead = "v1:" (3) + base64-encoded (iv 12 + tag 16 + ct 10000).
		// base64 inflates by ~4/3 → ~13371 chars. Verify nothing pathological.
		expect(cipher.length).toBeGreaterThan(13_000);
		expect(cipher.length).toBeLessThan(14_000);
	});

	it('round-trips UTF-8 multi-byte characters (emoji, Dutch diacritics)', () => {
		const plain = 'café 🇳🇱 → offerteaanvraag · €1.234,56';
		expect(decrypt(encrypt(plain))).toBe(plain);
	});

	it('round-trips control characters (newlines, tabs)', () => {
		const plain = 'line one\nline two\n\ttabbed\r\nwindows-style';
		expect(decrypt(encrypt(plain))).toBe(plain);
	});

	it('payload after the version prefix is valid base64', () => {
		const cipher = encrypt('any value');
		const payload = cipher.slice('v1:'.length);
		// Throws if not valid base64; result must round-trip back to the same string.
		const round = Buffer.from(payload, 'base64').toString('base64');
		// Buffer's base64 is canonical (no padding variance), but our payload uses standard
		// padding so the comparison should be exact.
		expect(round).toBe(payload);
	});

	it('encrypted payload has at least IV (12) + tag (16) = 28 bytes after the prefix', () => {
		const cipher = encrypt(''); // shortest possible plaintext
		const bytes = Buffer.from(cipher.slice('v1:'.length), 'base64').length;
		expect(bytes).toBe(28);
	});

	it('decrypt with a different key fails (GCM tag mismatch)', () => {
		const cipher = encrypt('secret-token');
		// Swap to a different valid key — should fail to decrypt the previous ciphertext.
		const original = process.env.TOKEN_ENCRYPTION_KEY;
		process.env.TOKEN_ENCRYPTION_KEY = 'cd'.repeat(32);
		try {
			expect(() => decrypt(cipher)).toThrow();
		} finally {
			process.env.TOKEN_ENCRYPTION_KEY = original;
		}
	});

	it('truncated ciphertext is rejected', () => {
		const cipher = encrypt('valid-token');
		const truncated = cipher.slice(0, cipher.length - 8);
		expect(() => decrypt(truncated)).toThrow();
	});

	it('rejects invalid key lengths (too short, too long, non-hex)', () => {
		const saved = process.env.TOKEN_ENCRYPTION_KEY;
		try {
			process.env.TOKEN_ENCRYPTION_KEY = 'ab'.repeat(16); // 32 chars, too short
			expect(() => encrypt('x')).toThrow(/64-char hex/);

			process.env.TOKEN_ENCRYPTION_KEY = 'ab'.repeat(48); // 96 chars, too long
			expect(() => encrypt('x')).toThrow(/64-char hex/);

			// Right length but Node's Buffer.from('z*'.repeat(32), 'hex') would silently
			// produce garbage for non-hex chars. Our length guard catches this case
			// because invalid hex still passes length but produces a short Buffer that
			// AES-256 will reject.
			process.env.TOKEN_ENCRYPTION_KEY = 'zz'.repeat(32);
			expect(() => encrypt('x')).toThrow();
		} finally {
			process.env.TOKEN_ENCRYPTION_KEY = saved;
		}
	});
});

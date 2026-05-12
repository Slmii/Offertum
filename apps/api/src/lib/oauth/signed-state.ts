import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Stateless CSRF protection for OAuth round trips.
 *
 * We sign a small payload (`{ nonce, organizationId, userId }`) with HMAC-SHA256 keyed
 * off `AUTH_SECRET`, base64url-encode it, and use it as the OAuth `state` parameter
 * AND as a httpOnly cookie value. On callback we verify the signature, that both
 * copies match, and that the included organizationId / userId still match the active
 * session. This way we don't need a server-side store of in-flight OAuth requests
 * (DB row, Redis key, etc.) — Google bounces the signed blob back to us untouched.
 *
 * Why we don't reuse Auth.js's session cookie for this:
 *  - We need to carry the organizationId/userId at the moment of "Connect" click — the
 *    session may have changed by the time the callback fires (user switched orgs).
 *  - State is per-flow, not per-session: two concurrent Connect attempts must not
 *    clobber each other.
 */

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes — plenty for the consent screen

interface OAuthStatePayload {
	nonce: string;
	organizationId: string;
	userId: string;
	issuedAt: number;
}

function sign(payload: string, secret: string): string {
	return createHmac('sha256', secret).update(payload).digest('base64url');
}

function base64urlEncode(value: string): string {
	return Buffer.from(value, 'utf8').toString('base64url');
}

function base64urlDecode(value: string): string {
	return Buffer.from(value, 'base64url').toString('utf8');
}

export function issueOAuthState(input: { organizationId: string; userId: string }, secret: string): string {
	const payload: OAuthStatePayload = {
		nonce: randomBytes(16).toString('base64url'),
		organizationId: input.organizationId,
		userId: input.userId,
		issuedAt: Date.now()
	};
	const encoded = base64urlEncode(JSON.stringify(payload));
	const signature = sign(encoded, secret);
	return `${encoded}.${signature}`;
}

export function verifyOAuthState(token: string, secret: string): OAuthStatePayload | null {
	const dot = token.indexOf('.');
	if (dot < 0) {
		return null;
	}

	const encoded = token.slice(0, dot);
	const provided = token.slice(dot + 1);
	const expected = sign(encoded, secret);

	// `timingSafeEqual` requires equal-length inputs. base64url signatures are always
	// the same length for the same algorithm, so this only triggers on malformed input.
	if (provided.length !== expected.length) {
		return null;
	}

	if (!timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) {
		return null;
	}

	let payload: OAuthStatePayload;
	try {
		payload = JSON.parse(base64urlDecode(encoded)) as OAuthStatePayload;
	} catch {
		return null;
	}

	if (Date.now() - payload.issuedAt > STATE_TTL_MS) {
		return null;
	}

	return payload;
}

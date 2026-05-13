import { createPublicKey, verify } from 'node:crypto';

/**
 * Hand-rolled JWT verifier for Google Pub/Sub push notifications.
 *
 * Pub/Sub authenticates push deliveries by signing a JWT with a Google service account
 * and putting it in the `Authorization: Bearer <token>` header. The JWT:
 *
 *  - is RS256-signed by Google
 *  - includes `iss: https://accounts.google.com`
 *  - includes `aud: <our configured audience>` (we set this when creating the subscription)
 *  - includes `email: service-<project>@gcp-sa-pubsub.iam.gserviceaccount.com` — Google's
 *    Pub/Sub service account for THIS project. Verifying `email` proves the push came
 *    from OUR Pub/Sub topic, not somebody else's that happens to have the same audience.
 *  - includes `exp` / `iat` standard timestamp claims
 *
 * No external JWT lib — Node 16+'s `crypto.createPublicKey({ format: 'jwk' })` accepts
 * JWKs directly, and `crypto.verify` does RS256 natively. Matches the project's
 * hand-rolled-OAuth pattern (no `googleapis` dep).
 *
 * The JWKS URL is Google's well-known endpoint. Keys rotate roughly daily; we cache for
 * up to JWKS_CACHE_TTL_MS and refresh past that. The verifier is async, but the inner
 * crypto verification is sync — the only awaits are for JWKS fetch when the cache misses.
 */

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ACCEPTED_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000;

/** Allowable clock skew in seconds when validating `exp`/`iat`. */
const CLOCK_SKEW_SECONDS = 60;

interface JsonWebKey {
	kty: string;
	use?: string;
	kid: string;
	n: string;
	e: string;
	alg?: string;
}

interface JwtHeader {
	alg: string;
	kid: string;
	typ?: string;
}

export interface PubSubJWTPayload {
	iss: string;
	aud: string;
	exp: number;
	iat: number;
	email: string;
	email_verified: boolean;
	sub: string;
}

/**
 * In-memory JWKS cache. Module-level so a hot path doesn't re-fetch on every push.
 * `fetcher` is parameterised for tests — the production path uses the real `fetch`.
 */
let cachedKeys: { keys: JsonWebKey[]; fetchedAt: number } | null = null;

async function fetchJwks(fetcher: typeof fetch): Promise<JsonWebKey[]> {
	const response = await fetcher(GOOGLE_JWKS_URL);
	if (!response.ok) {
		throw new PubSubJWTVerificationError(`JWKS fetch failed: HTTP ${response.status}`);
	}
	const body = (await response.json()) as { keys: JsonWebKey[] };
	return body.keys;
}

async function getKey(kid: string, fetcher: typeof fetch): Promise<JsonWebKey> {
	if (cachedKeys && Date.now() - cachedKeys.fetchedAt < JWKS_CACHE_TTL_MS) {
		const key = cachedKeys.keys.find(k => k.kid === kid);
		if (key) {
			return key;
		}
		// Cache miss on kid means Google rotated keys — fall through to refetch.
	}

	const keys = await fetchJwks(fetcher);
	cachedKeys = { keys, fetchedAt: Date.now() };
	const key = cachedKeys.keys.find(k => k.kid === kid);
	if (!key) {
		throw new PubSubJWTVerificationError(`Unknown key id: ${kid}`);
	}
	return key;
}

/** Clear the in-memory cache — exposed for tests so each run starts clean. */
export function resetPubSubJwksCache(): void {
	cachedKeys = null;
}

export class PubSubJWTVerificationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'PubSubJWTVerificationError';
	}
}

/**
 * Verify a Pub/Sub push JWT. Throws `PubSubJWTVerificationError` on any failure:
 * malformed token, bad signature, expired, wrong issuer, wrong audience, wrong service
 * account email, JWKS-unreachable.
 *
 * Returns the verified payload on success — callers typically don't need it beyond
 * the verification step, but the payload contains the service account `email` and `sub`
 * which are useful for audit logging.
 *
 * `fetcher` is dependency-injectable for tests (default: global `fetch`).
 */
export async function verifyPubSubJWT(
	token: string,
	expectedAudience: string,
	expectedServiceAccount: string,
	fetcher: typeof fetch = fetch
): Promise<PubSubJWTPayload> {
	const parts = token.split('.');
	if (parts.length !== 3) {
		throw new PubSubJWTVerificationError('Token must have 3 dot-separated parts');
	}

	const [encodedHeader, encodedPayload, encodedSignature] = parts as [string, string, string];

	const header = parseJsonSegment<JwtHeader>(encodedHeader, 'header');
	if (header.alg !== 'RS256') {
		throw new PubSubJWTVerificationError(`Unsupported alg: ${header.alg}`);
	}
	if (!header.kid) {
		throw new PubSubJWTVerificationError('Token header missing kid');
	}

	const payload = parseJsonSegment<PubSubJWTPayload>(encodedPayload, 'payload');

	// Validate claims first — if they're wrong we shouldn't even bother with the (expensive)
	// signature verification, and the error message is more useful for debugging.
	const now = Math.floor(Date.now() / 1000);
	if (typeof payload.exp !== 'number' || payload.exp + CLOCK_SKEW_SECONDS < now) {
		throw new PubSubJWTVerificationError('Token expired');
	}
	if (typeof payload.iat !== 'number' || payload.iat - CLOCK_SKEW_SECONDS > now) {
		throw new PubSubJWTVerificationError('Token iat is in the future');
	}
	if (!ACCEPTED_ISSUERS.includes(payload.iss)) {
		throw new PubSubJWTVerificationError(`Unexpected issuer: ${payload.iss}`);
	}
	if (payload.aud !== expectedAudience) {
		throw new PubSubJWTVerificationError(`Unexpected audience: ${payload.aud}`);
	}
	if (payload.email !== expectedServiceAccount) {
		throw new PubSubJWTVerificationError(`Unexpected service account email: ${payload.email}`);
	}
	if (payload.email_verified !== true) {
		throw new PubSubJWTVerificationError('email_verified claim is not true');
	}

	const key = await getKey(header.kid, fetcher);
	const publicKey = createPublicKey({ format: 'jwk', key: key as never });
	const signedData = Buffer.from(`${encodedHeader}.${encodedPayload}`);
	const signature = Buffer.from(encodedSignature, 'base64url');

	const ok = verify('sha256', signedData, publicKey, signature);
	if (!ok) {
		throw new PubSubJWTVerificationError('Signature verification failed');
	}

	return payload;
}

function parseJsonSegment<T>(segment: string, label: string): T {
	try {
		const decoded = Buffer.from(segment, 'base64url').toString('utf8');
		return JSON.parse(decoded) as T;
	} catch {
		throw new PubSubJWTVerificationError(`Token ${label} is not valid base64url-encoded JSON`);
	}
}

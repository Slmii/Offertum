import { PubSubJWTVerificationError, resetPubSubJwksCache, verifyPubSubJWT } from '@/lib/oauth/pubsub-jwt-verifier';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, type KeyObject } from 'node:crypto';

/**
 * Pin clock for reliable exp/iat math. 2026-05-13T12:00:00Z.
 */
const NOW_SECONDS = 1778760000;
const KID = 'test-kid-1';
const SERVICE_ACCOUNT = 'service-12345@gcp-sa-pubsub.iam.gserviceaccount.com';
const AUDIENCE = 'https://app.example.com/api/email/gmail/webhook';

let privateKey: KeyObject;
let publicKey: KeyObject;
let jwksResponse: { keys: object[] };

beforeAll(() => {
	const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
	privateKey = createPrivateKey(pair.privateKey.export({ type: 'pkcs8', format: 'pem' }));
	publicKey = createPublicKey(pair.publicKey.export({ type: 'spki', format: 'pem' }));

	const jwk = publicKey.export({ format: 'jwk' });
	jwksResponse = {
		keys: [{ ...jwk, kid: KID, alg: 'RS256', use: 'sig' }]
	};
});

beforeEach(() => {
	resetPubSubJwksCache();
});

interface PayloadOverrides {
	iss?: string;
	aud?: string;
	exp?: number;
	iat?: number;
	email?: string;
	email_verified?: boolean;
	sub?: string;
}

function buildJwt(overrides: PayloadOverrides = {}, headerOverrides: object = {}): string {
	const header = {
		alg: 'RS256',
		typ: 'JWT',
		kid: KID,
		...headerOverrides
	};
	const payload = {
		iss: 'https://accounts.google.com',
		aud: AUDIENCE,
		exp: NOW_SECONDS + 600,
		iat: NOW_SECONDS - 60,
		email: SERVICE_ACCOUNT,
		email_verified: true,
		sub: '1234567890',
		...overrides
	};

	const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
	const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
	const signedData = `${encodedHeader}.${encodedPayload}`;
	const signature = sign('sha256', Buffer.from(signedData), privateKey).toString('base64url');
	return `${signedData}.${signature}`;
}

function makeFetcher(): typeof fetch {
	// Returns a function shaped like `fetch`. The verifier only uses `.ok` + `.json()`.
	return (async () => ({
		ok: true,
		json: async () => jwksResponse
	})) as unknown as typeof fetch;
}

describe('verifyPubSubJWT', () => {
	const realDateNow = Date.now;
	beforeEach(() => {
		Date.now = () => NOW_SECONDS * 1000;
	});
	afterEach(() => {
		Date.now = realDateNow;
	});

	it('accepts a well-formed JWT signed by the expected key', async () => {
		const token = buildJwt();
		const payload = await verifyPubSubJWT(token, AUDIENCE, SERVICE_ACCOUNT, makeFetcher());

		expect(payload.email).toBe(SERVICE_ACCOUNT);
		expect(payload.aud).toBe(AUDIENCE);
		expect(payload.iss).toBe('https://accounts.google.com');
	});

	it('rejects a tampered payload (signature mismatch)', async () => {
		const token = buildJwt();
		const [encodedHeader, encodedPayload, encodedSignature] = token.split('.') as [string, string, string];
		// Mutate the payload but keep the original signature → verification fails.
		const tamperedPayload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString());
		tamperedPayload.email = 'attacker@example.com';
		const newEncodedPayload = Buffer.from(JSON.stringify(tamperedPayload)).toString('base64url');
		const tampered = `${encodedHeader}.${newEncodedPayload}.${encodedSignature}`;

		await expect(verifyPubSubJWT(tampered, AUDIENCE, SERVICE_ACCOUNT, makeFetcher())).rejects.toThrow(
			PubSubJWTVerificationError
		);
	});

	it('rejects an expired token', async () => {
		const token = buildJwt({ exp: NOW_SECONDS - 3600 });
		await expect(verifyPubSubJWT(token, AUDIENCE, SERVICE_ACCOUNT, makeFetcher())).rejects.toThrow('Token expired');
	});

	it('rejects a token with an iat in the future', async () => {
		const token = buildJwt({ iat: NOW_SECONDS + 600 });
		await expect(verifyPubSubJWT(token, AUDIENCE, SERVICE_ACCOUNT, makeFetcher())).rejects.toThrow(
			'iat is in the future'
		);
	});

	it('rejects the wrong issuer', async () => {
		const token = buildJwt({ iss: 'https://attacker.example.com' });
		await expect(verifyPubSubJWT(token, AUDIENCE, SERVICE_ACCOUNT, makeFetcher())).rejects.toThrow(
			'Unexpected issuer'
		);
	});

	it('rejects the wrong audience', async () => {
		const token = buildJwt({ aud: 'https://other-app.example.com/webhook' });
		await expect(verifyPubSubJWT(token, AUDIENCE, SERVICE_ACCOUNT, makeFetcher())).rejects.toThrow(
			'Unexpected audience'
		);
	});

	it('rejects a different service account email (cross-project hijack defense)', async () => {
		const token = buildJwt({ email: 'service-99999@gcp-sa-pubsub.iam.gserviceaccount.com' });
		await expect(verifyPubSubJWT(token, AUDIENCE, SERVICE_ACCOUNT, makeFetcher())).rejects.toThrow(
			'Unexpected service account email'
		);
	});

	it('rejects when email_verified is not true', async () => {
		const token = buildJwt({ email_verified: false });
		await expect(verifyPubSubJWT(token, AUDIENCE, SERVICE_ACCOUNT, makeFetcher())).rejects.toThrow(
			'email_verified claim is not true'
		);
	});

	it('rejects an unsupported algorithm (HS256 / none / etc.)', async () => {
		const token = buildJwt({}, { alg: 'HS256' });
		await expect(verifyPubSubJWT(token, AUDIENCE, SERVICE_ACCOUNT, makeFetcher())).rejects.toThrow(
			'Unsupported alg'
		);
	});

	it('rejects a token whose kid is not in the JWKS', async () => {
		const token = buildJwt({}, { kid: 'unknown-kid' });
		await expect(verifyPubSubJWT(token, AUDIENCE, SERVICE_ACCOUNT, makeFetcher())).rejects.toThrow(
			'Unknown key id'
		);
	});

	it('rejects a malformed token (not 3 parts)', async () => {
		await expect(verifyPubSubJWT('not.a-jwt', AUDIENCE, SERVICE_ACCOUNT, makeFetcher())).rejects.toThrow(
			'3 dot-separated parts'
		);
	});

	it('rejects a token with a non-JSON header', async () => {
		const goodToken = buildJwt();
		const [, encodedPayload, encodedSignature] = goodToken.split('.') as [string, string, string];
		const garbledHeader = Buffer.from('not-json-{{{').toString('base64url');
		const malformed = `${garbledHeader}.${encodedPayload}.${encodedSignature}`;

		await expect(verifyPubSubJWT(malformed, AUDIENCE, SERVICE_ACCOUNT, makeFetcher())).rejects.toThrow(
			'Token header is not valid'
		);
	});
});

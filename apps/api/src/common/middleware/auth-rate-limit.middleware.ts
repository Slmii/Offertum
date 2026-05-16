import type { NextFunction, Request, Response } from 'express';

/**
 * Sliding-window rate limit for `/api/auth/*` POST traffic — primarily defends the
 * magic-link emit endpoint from being weaponized into a spam-relay or used to enumerate
 * which emails have accounts on the platform.
 *
 * Two independent buckets, both required to pass:
 *  1. **Per-IP** — caps the total magic-link emit rate from any single source (covers
 *     scripted enumeration that cycles target emails).
 *  2. **Per-email** — caps how often the same destination address gets a link (covers
 *     "stuck send" mistakes by legitimate users + targeted harassment of one inbox).
 *
 * GET traffic (CSRF token, session lookup, callback) is exempt — those are
 * cheap, non-side-effecting reads that Auth.js fires on every page load.
 *
 * In-memory store is fine for single-instance deploys. App Platform `instance_count: 1`
 * today; if we scale horizontally, swap this for a Redis-backed limiter (the audit follow-up
 * captures that). Cleanup runs lazily on each request — no setInterval / unref dance.
 */

const PER_IP_LIMIT = 10; // requests per WINDOW
const PER_EMAIL_LIMIT = 5; // requests per WINDOW
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

interface Bucket {
	timestamps: number[];
}

const ipBuckets = new Map<string, Bucket>();
const emailBuckets = new Map<string, Bucket>();

function prune(bucket: Bucket, now: number): void {
	const cutoff = now - WINDOW_MS;
	let i = 0;
	while (i < bucket.timestamps.length) {
		const ts = bucket.timestamps[i];
		if (ts === undefined || ts >= cutoff) {
			break;
		}
		i++;
	}
	if (i > 0) {
		bucket.timestamps.splice(0, i);
	}
}

function hit(store: Map<string, Bucket>, key: string, limit: number, now: number): boolean {
	let bucket = store.get(key);
	if (!bucket) {
		bucket = { timestamps: [] };
		store.set(key, bucket);
	}
	prune(bucket, now);
	if (bucket.timestamps.length >= limit) {
		return false;
	}
	bucket.timestamps.push(now);
	return true;
}

function readEmail(request: Request): string | null {
	// Auth.js posts form-encoded bodies to /api/auth/signin/<provider> with `email` field.
	// Body parsing may not have happened yet (ExpressAuth handles its own), so fall back
	// to scanning the raw body or the query string if needed. In practice req.body is
	// populated by the time this middleware runs because we register the JSON parser
	// upstream — but `application/x-www-form-urlencoded` isn't, so this is best-effort.
	const body = (request as Request & { body?: Record<string, unknown> }).body;
	const fromBody = body && typeof body.email === 'string' ? body.email : null;
	const fromQuery = typeof request.query.email === 'string' ? request.query.email : null;
	const value = fromBody ?? fromQuery;
	return value ? value.trim().toLowerCase() : null;
}

export function authRateLimitMiddleware(request: Request, response: Response, next: NextFunction): void {
	if (request.method !== 'POST') {
		next();
		return;
	}

	const now = Date.now();
	const ip = request.ip ?? 'unknown';

	if (!hit(ipBuckets, ip, PER_IP_LIMIT, now)) {
		response.status(429).json({
			statusCode: 429,
			message: 'Too many authentication requests from this IP. Try again later.'
		});
		return;
	}

	const email = readEmail(request);
	if (email && !hit(emailBuckets, email, PER_EMAIL_LIMIT, now)) {
		response.status(429).json({
			statusCode: 429,
			message: 'Too many sign-in attempts for this email. Try again later.'
		});
		return;
	}

	next();
}

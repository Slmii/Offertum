import { SignupController } from '@/modules/auth/signup.controller';
import { describe, expect, it } from '@jest/globals';

/**
 * Metadata-level check for the rate-limit decorator. Without `supertest` we can't drive
 * 6 real HTTP requests through a running app to observe a 429, but reading the decorator
 * metadata proves the config we WOULD inject. Catches the common regression "someone
 * tweaked the @Throttle() values and didn't notice."
 *
 * The real end-to-end behavior (5 requests succeed, 6th 429s with Retry-After) stays a
 * manual smoke until we add supertest.
 *
 * `BillingController.webhook` uses `@SkipThrottle()`. We don't assert that here because
 * importing BillingController transitively pulls @auth/express (pure ESM) which the
 * current SWC-Jest config doesn't transform.
 *
 * Key shape (from node_modules/@nestjs/throttler/dist/throttler.constants.d.ts):
 *   THROTTLER_LIMIT  = 'THROTTLER:LIMIT'
 *   THROTTLER_TTL    = 'THROTTLER:TTL'
 * The Throttle decorator concatenates the bucket name (`default` for us) onto each key.
 * We hardcode the prefixes here because @nestjs/throttler's package index does NOT re-export
 * the constants — importing them by name resolves to `undefined` at runtime.
 */
const THROTTLER_LIMIT_KEY = 'THROTTLER:LIMITdefault';
const THROTTLER_TTL_KEY = 'THROTTLER:TTLdefault';

describe('Rate limit metadata', () => {
	it('SignupController.create is throttled at 5 per hour per IP', () => {
		const target = SignupController.prototype.create;
		expect(Reflect.getMetadata(THROTTLER_LIMIT_KEY, target)).toBe(5);
		expect(Reflect.getMetadata(THROTTLER_TTL_KEY, target)).toBe(60 * 60 * 1000);
	});
});

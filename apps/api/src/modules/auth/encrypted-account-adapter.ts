import { maybeEncrypt } from '@/lib/crypto/token-encryption';
import type { Adapter, AdapterAccount } from '@auth/core/adapters';

/**
 * Wraps an Auth.js adapter so that OAuth token fields on the `Account` table
 * (`access_token`, `refresh_token`, `id_token`) are encrypted before they hit the DB.
 *
 * Only the write path needs interception — Auth.js itself doesn't read these tokens
 * back when using JWT-strategy sessions (the token-bearing User lookup is done via
 * `provider + providerAccountId` indices, which aren't touched). Our own inbox-sync
 * code (Week 3) will read + decrypt the refresh token on demand via `decrypt(...)`
 * from `lib/crypto/token-encryption.ts`.
 */
export function withEncryptedAccountTokens(adapter: Adapter): Adapter {
	return {
		...adapter,
		async linkAccount(account: AdapterAccount): Promise<AdapterAccount | null | undefined> {
			if (!adapter.linkAccount) {
				return undefined;
			}

			const result = await adapter.linkAccount({
				...account,
				access_token: maybeEncrypt(account.access_token) ?? undefined,
				refresh_token: maybeEncrypt(account.refresh_token) ?? undefined,
				id_token: maybeEncrypt(account.id_token) ?? undefined
			});

			// Auth.js's `linkAccount` is typed as `void | AdapterAccount | null | undefined`
			// depending on adapter version. Coerce `void` → undefined.
			return result ?? undefined;
		}
	};
}

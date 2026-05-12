/**
 * Thrown when Google rejects a refresh-token call with `invalid_grant`. This is Google's
 * canonical signal that the refresh token is dead — typically because:
 *  - the user revoked our app at myaccount.google.com/permissions
 *  - the refresh token went 6+ months without use (Google's idle timeout)
 *  - the user changed their password (some account configurations)
 *  - the OAuth client itself was rotated/deleted at Google Cloud
 *
 * Distinct from generic OAuth failures because the recovery is different: the local
 * EmailAccount row is now garbage and should be deleted, NOT retried. Callers in
 * `EmailAccountsService` catch this specifically and self-heal by deleting the row.
 */
export class OAuthRefreshTokenInvalidException extends Error {
	constructor(message = 'Refresh token is no longer valid at the provider') {
		super(message);
		this.name = 'OAuthRefreshTokenInvalidException';
	}
}

/**
 * Thrown when a Gmail API call returns HTTP 401 (Invalid Credentials). The access token
 * still looks fresh on our side (within its cached expiry window) but Google has revoked
 * it upstream — most commonly because the user clicked "Remove access" at
 * myaccount.google.com/permissions and the next API call is the first time we hear about it.
 *
 * Caught by `EmailAccountsService.withFreshAccessToken`, which forces a refresh (which
 * itself surfaces `invalid_grant` → row deletion + 404) and retries the call exactly once.
 */
export class GmailUnauthorizedException extends Error {
	constructor(message = 'Gmail rejected the access token (HTTP 401)') {
		super(message);
		this.name = 'GmailUnauthorizedException';
	}
}

/**
 * Minimum scopes for the inbox-connect flow.
 *
 *  - `gmail.readonly`: list + fetch messages.
 *  - `gmail.send`:     send replies ( one-tap send).
 *
 * NOT requested:
 *  - `gmail.modify`: would let us mark-as-read / change labels. Defer until we actually
 *    need it — broader scope = more friction on the consent screen.
 *
 * `openid email profile` is bundled so the Gmail callback can identify which mailbox
 * was just linked without a separate `userinfo` round trip. (We still do the round trip
 * for resilience but the ID token contains the same data.)
 */
export const GMAIL_OAUTH_SCOPES = [
	'openid',
	'email',
	'profile',
	'https://www.googleapis.com/auth/gmail.readonly',
	'https://www.googleapis.com/auth/gmail.send'
];

/** Google's OAuth2 endpoints. Pinned here so a typo doesn't propagate across services. */
export const GOOGLE_OAUTH_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_OAUTH_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
export const GOOGLE_OAUTH_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

export const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1';

/** Cookie carrying the signed OAuth state across the redirect. */
export const GMAIL_STATE_COOKIE = 'q_gmail_oauth_state';

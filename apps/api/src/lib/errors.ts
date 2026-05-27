/**
 * Centralized error messages. Every `throw` in the API should source its message from this
 * file so we can find / rename / translate them in one place.
 *
 * - SCREAMING_SNAKE_CASE constants → static messages.
 * - camelCase functions → templates with interpolation (call them at the throw site).
 *
 * Messages marked `User-facing` go to clients in 4xx responses (treat as copy).
 * Messages marked `Dev-facing` only surface in logs / 5xx — usually config bugs.
 */

// ────────────────────────────────────────────────────────────────────────────
// Organization (User-facing)
// ────────────────────────────────────────────────────────────────────────────
export const ORGANIZATION_NOT_FOUND = 'Organization not found';
export const NO_ACTIVE_ORGANIZATION =
	'No active organization. You must be a member of an organization to access this route.';
export const MEMBERSHIP_NOT_FOUND = 'Membership not found in the active organization';
// User-facing — surfaced when an OWNER attempts to remove their own membership. Ownership
// transfer (if we ever build it) is a separate flow; deleting the owner would orphan the org.
export const CANNOT_REMOVE_SELF =
	'You cannot remove yourself. Ask another owner, or contact support to transfer ownership.';
// User-facing — surfaced when an OWNER attempts to remove another OWNER. Today there's only
// one owner per org, so this is mostly defensive; if multi-owner ever lands, surface
// "transfer ownership first" as a follow-up.
export const CANNOT_REMOVE_OWNER = 'Cannot remove the organization owner.';

// ────────────────────────────────────────────────────────────────────────────
// Invitations (User-facing)
// ────────────────────────────────────────────────────────────────────────────
export const INVITATION_NOT_FOUND = 'Invitation not found';
export const INVITATION_EXPIRED = 'Invitation expired';
export const INVITATION_ALREADY_ACCEPTED = 'Invitation has already been accepted';
export const INVITATION_ALREADY_PENDING = 'An invitation for this email is already pending';
export const USER_ALREADY_MEMBER = 'This person is already a member of the organization';
export const OWNER_ROLE_NOT_INVITABLE =
	'Owner role cannot be assigned via invitation — every organization has exactly one owner';

// ────────────────────────────────────────────────────────────────────────────
// Auth
// ────────────────────────────────────────────────────────────────────────────
// User-facing
export const NOT_AUTHENTICATED = 'Not authenticated';
export const OWNER_ROLE_REQUIRED = 'Only the organization owner can access this resource';
// User-facing — surfaced when an EXTERNAL-role user hits a route that's reserved for
// primary members (OWNER/MEMBER). EXTERNAL is a consumer role, not a contributor.
export const MEMBER_ROLE_REQUIRED = 'External collaborators cannot perform this action.';
// User-facing — surfaced when /api/signup hits a duplicate email
export const ACCOUNT_ALREADY_EXISTS = 'An account with this email already exists. Sign in instead.';
export const DISPOSABLE_EMAIL_NOT_ALLOWED = 'Disposable email addresses are not allowed. Please use a work email.';
// Dev-facing — Auth.js's OAuth (Google/Microsoft) createUser path stays blocked.
// Self-signup goes through the explicit POST /api/signup endpoint with company name;
// OAuth providers are sign-in-only for already-provisioned users.
export const SELF_SIGNUP_DISABLED = 'OAuth self-signup is disabled. Use the email signup form.';

// ────────────────────────────────────────────────────────────────────────────
// Billing — config errors (Dev-facing; should never reach production)
// ────────────────────────────────────────────────────────────────────────────
export const STRIPE_SECRET_KEY_MISSING = 'STRIPE_SECRET_KEY is not set';
export const STRIPE_PRICE_ID_MISSING = 'STRIPE_PRICE_ID is not configured';
export const STRIPE_WEBHOOK_SECRET_MISSING = 'STRIPE_WEBHOOK_SECRET is not configured';

// ────────────────────────────────────────────────────────────────────────────
// Billing — webhook
// ────────────────────────────────────────────────────────────────────────────
export const STRIPE_SIGNATURE_HEADER_MISSING = 'Missing Stripe-Signature header';
export const STRIPE_RAW_BODY_MISSING = 'Raw body unavailable — check rawBody option in main.ts';
export const STRIPE_SIGNATURE_INVALID = 'Invalid signature';

// ────────────────────────────────────────────────────────────────────────────
// Billing — runtime (User-facing — surfaced in 5xx / 4xx responses)
// ────────────────────────────────────────────────────────────────────────────
export const STRIPE_CHECKOUT_URL_MISSING = 'Stripe did not return a checkout URL';
export const noStripeCustomerForOrg = (organizationId: string) =>
	`No Stripe customer exists for organization ${organizationId}`;

// ────────────────────────────────────────────────────────────────────────────
// Billing — entitlement (User-facing — paired with structured `code` fields)
// ────────────────────────────────────────────────────────────────────────────
// Generic message returned by EntitlementGuard for all non-entitled write attempts
// (trial expired, canceled, unpaid, etc.). The web client renders state-specific copy
// via `billingBlockedCopy()`; this string is the fallback for non-web callers.
export const SUBSCRIPTION_REQUIRED = 'An active subscription is required to make changes.';
export const MISSING_ORG_CONTEXT = 'Missing organization context.';
export const subscriptionAlreadyActive = (status: string) =>
	`Organization already has an active subscription (${status}). Use the Customer Portal to manage it.`;
export const trialSeatLimitReached = (cap: number) =>
	`Trial accounts are limited to ${cap} seats. Subscribe to invite more teammates.`;

// ────────────────────────────────────────────────────────────────────────────
// Gmail / email connection (Dev-facing config + User-facing OAuth failures)
// ────────────────────────────────────────────────────────────────────────────
export const GOOGLE_OAUTH_NOT_CONFIGURED =
	'Google OAuth is not configured (set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET).';
export const MICROSOFT_OAUTH_NOT_CONFIGURED =
	'Microsoft OAuth is not configured (set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET).';
export const OAUTH_STATE_INVALID = 'OAuth state mismatch — possible CSRF, restart the connect flow.';
export const OAUTH_CODE_MISSING = 'OAuth callback is missing the authorization code.';
export const OAUTH_TOKEN_EXCHANGE_FAILED = 'Failed to exchange OAuth code for tokens.';
export const OAUTH_USERINFO_FAILED = 'Failed to fetch user info from the OAuth provider.';

/**
 * Stable error codes the OAuth callback handlers redirect to
 * `/settings/email?error=<code>` with. Web client maps each to friendly UI copy in
 * `apps/web/src/lib/utils/email-connect-error.ts`. Never reuse a code for a different
 * meaning — clients in the wild may have URLs pointing at any historical value.
 *
 * Naming: lowercase snake-ish (`<area>_<reason>`), provider-prefixed only when the
 * cause is provider-specific (e.g. `microsoft_admin_consent_required`).
 */
export const EmailConnectErrorCode = {
	StateMismatch: 'oauth_state_mismatch',
	CodeMissing: 'oauth_code_missing',
	CodeReused: 'oauth_code_invalid',
	TokenExchangeFailed: 'oauth_token_exchange_failed',
	UserInfoFailed: 'oauth_userinfo_failed',
	ProviderRejected: 'oauth_provider_rejected',
	NotConfigured: 'oauth_provider_misconfigured',
	Unknown: 'oauth_unknown_error'
} as const;

export type EmailConnectErrorCode = (typeof EmailConnectErrorCode)[keyof typeof EmailConnectErrorCode];
export const EMAIL_ACCOUNT_NOT_FOUND = 'No connected mail account for this organization.';
// Dev-facing — surfaced as generic 500 when a Gmail or Graph API endpoint returns non-2xx.
// Optional `cause` is the provider's own `error.message` field when we can parse it (Graph
// returns `{ error: { code, message } }`); surfacing it in the thrown exception makes the
// reason show up in stack traces instead of being buried in the Log table.
export const GMAIL_API_CALL_FAILED = (operation: string, cause?: string) =>
	cause ? `Gmail API ${operation} failed: ${cause}` : `Gmail API ${operation} failed`;
export const MICROSOFT_GRAPH_API_CALL_FAILED = (operation: string, cause?: string) =>
	cause ? `Microsoft Graph API ${operation} failed: ${cause}` : `Microsoft Graph API ${operation} failed`;
// Dev-facing — both Gmail + Microsoft. Should never reach a user; signals a refresh-token
// disappeared between issue + reuse, which we don't expect outside a Prisma bug.
export const NO_REFRESH_TOKEN_AVAILABLE = 'No refresh token in token exchange response and no existing one on file';

// ────────────────────────────────────────────────────────────────────────────
// Opportunities (User-facing)
// ────────────────────────────────────────────────────────────────────────────
export const OPPORTUNITY_NOT_FOUND = 'Opportunity not found';
// User-facing — surfaced when an owner un-dismisses a row that wasn't dismissed in the
// first place. Returned as 409 so the FE can swallow + refresh state without surfacing
// a scary error toast for what's effectively a duplicate click.
export const OPPORTUNITY_NOT_DISMISSED = 'Opportunity is not dismissed.';
// User-facing — surfaced when the assignment payload references a user who isn't
// a member of the opp's organization. 404 (rather than 422) keeps the wire shape
// consistent with the rest of the "this user can't be found here" responses.
export const OPPORTUNITY_ASSIGNEE_NOT_IN_ORG = 'Assignee is not a member of this organization.';

// User-facing — surfaced when a rule-CRUD endpoint references a rule that doesn't
// belong to the requesting org's pricing playbook. 404 keeps cross-tenant attempts
// indistinguishable from genuinely-missing rules.
export const PRICING_PLAYBOOK_RULE_NOT_FOUND = 'Pricing rule not found.';
// User-facing — surfaced when a catalog-item CRUD endpoint references an id that
// doesn't belong to the requesting org. 404 to keep cross-tenant probing opaque.
export const CATALOG_ITEM_NOT_FOUND = 'Catalog item not found.';
// User-facing — surfaced when the editor tries to save edits to a draft that
// hasn't been generated yet (the Inngest function hasn't run). The FE should poll +
// retry rather than blowing up; this message is the fallback for non-web callers.
export const REPLY_DRAFT_NOT_FOUND = 'Reply draft has not been generated yet.';
// User-facing — surfaced when a user tries to regenerate a draft that's already been
// sent. The email is out the door; there's nothing to regenerate.
export const REPLY_DRAFT_ALREADY_SENT = 'Reply draft has already been sent and cannot be regenerated.';
// User-facing — surfaced when the user tries to mutate the draft body, regenerate it,
// or change attachments while the draft is closed for editing. "Closed" = the email
// was sent OR the opportunity moved to a terminal-for-draft status (replied / won /
// lost). Unified message because the FE already gates the buttons; this only fires on
// stale-state races + direct API hits.
export const REPLY_DRAFT_LOCKED =
	'This reply draft is closed for editing (the email was sent, or the opportunity is replied / won / lost).';
// User-facing — surfaced when the inbox owner who connected the mailbox has been
// removed from the org, or the original email had no `From:` address. Either way we
// can't send a reply through that mailbox.
export const REPLY_DRAFT_CANNOT_SEND = 'Cannot send reply: the inbox is no longer connectable.';

// ────────────────────────────────────────────────────────────────────────────
// Reply-draft attachments (User-facing)
// ────────────────────────────────────────────────────────────────────────────
export const ATTACHMENT_FILE_MISSING = 'No file uploaded. Pick a file and try again.';
export const ATTACHMENT_NOT_FOUND = 'Attachment not found';
export const attachmentMimeNotAllowed = (mime: string) =>
	`File type '${mime}' is not allowed. Accepted: PDF, Office docs, images, plain text, CSV, ZIP.`;
export const attachmentFileTooLarge = (sizeBytes: number, maxBytes: number) =>
	`File is ${formatBytes(sizeBytes)} which exceeds the per-file limit of ${formatBytes(maxBytes)}.`;
export const attachmentTotalTooLarge = (totalBytes: number, maxBytes: number) =>
	`Combined attachments would be ${formatBytes(totalBytes)} which exceeds the total limit of ${formatBytes(maxBytes)}.`;
export const attachmentCountExceeded = (max: number) => `You can attach at most ${max} files per draft.`;

function formatBytes(bytes: number): string {
	if (bytes >= 1024 * 1024) {
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}
	if (bytes >= 1024) {
		return `${(bytes / 1024).toFixed(0)} KB`;
	}
	return `${bytes} B`;
}

// ────────────────────────────────────────────────────────────────────────────
// Microsoft Entra — admin-consent flow (User-facing — structured error code)
// ────────────────────────────────────────────────────────────────────────────
/**
 * Stable error identifier surfaced on `/settings/email?error=microsoft_admin_consent_required`.
 * The web client matches on this exact string to render the admin-consent CTA.
 */
export const MICROSOFT_ADMIN_CONSENT_REQUIRED = 'microsoft_admin_consent_required';

/**
 * Entra error codes that indicate the user's tenant admin must approve our app before any
 * user in that tenant can connect a mailbox. We match these against the `error_description`
 * query param Entra returns to our callback.
 *
 *  - AADSTS65001  — user/admin has not consented (org-wide user-consent disabled)
 *  - AADSTS90094  — admin permission required for this scope
 *  - AADSTS900971 — no reply address (admin-consent flow variant)
 */
export const MICROSOFT_ADMIN_CONSENT_ERROR_CODE_REGEX = /AADSTS(65001|90094|900971)\b/;

/**
 * Build the Entra admin-consent URL. The tenant admin opens this once; Entra grants the
 * app's requested permissions to the whole tenant. After that any user in the tenant
 * can complete the regular `/connect` flow without hitting the user-consent wall.
 *
 * Uses `common` as the tenant — Entra resolves the actual tenant from the admin's
 * sign-in, so we don't need to know it in advance.
 */
export const buildMicrosoftAdminConsentUrl = (clientId: string, redirectUri: string): string => {
	const params = new URLSearchParams({
		client_id: clientId,
		redirect_uri: redirectUri
	});
	return `https://login.microsoftonline.com/common/adminconsent?${params.toString()}`;
};

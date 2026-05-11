/**
 * Stripe Subscription.status values that entitle the org to write access.
 * - `trialing`: free trial period with a saved payment method.
 * - `active`: paid and current.
 * - `past_due`: last invoice failed; Stripe is retrying. Don't lock the customer out
 *    mid-retry — billing dunning will handle it. If retries are exhausted, Stripe flips
 *    to `unpaid` or `canceled` and the gate engages.
 */
export const ENTITLED_STRIPE_STATUSES: ReadonlyArray<string> = ['trialing', 'active', 'past_due'];

/**
 * Length of the local-grace trial that starts on org creation. Distinct from Stripe's
 * `subscription_data.trial_period_days` (which only starts once the user has gone through
 * Checkout and attached a payment method). This window lets a brand-new org explore the
 * product before being asked for a card.
 */
export const LOCAL_TRIAL_DAYS = 14;
export const LOCAL_TRIAL_MS = LOCAL_TRIAL_DAYS * 24 * 60 * 60 * 1000;

/**
 * HTTP methods that count as "reads" and bypass the trial gate. Even an expired org should
 * be able to list their data, view their dashboard, etc. — they just can't make changes
 * until they subscribe.
 */
export const READ_METHODS: ReadonlyArray<string> = ['GET', 'HEAD', 'OPTIONS'];

/**
 * Stable error code surfaced in the 402 response body. Web clients pattern-match on this
 * to redirect to /billing instead of showing a generic error.
 */
export const BILLING_REQUIRED_CODE = 'billing_required';

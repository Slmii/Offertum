/**
 * The single business time zone for the whole app. Offertum targets Dutch SMBs, so every
 * "which calendar day" decision (all-day calendar events, the quote PDF's printed dates) and
 * every scheduled-job local time resolves against this one zone.
 *
 * Centralized here so the NL assumption lives in exactly one place. If Offertum ever goes
 * multi-market, promote this to a per-org setting (e.g. `Organization.timeZone`, defaulting to
 * this value) and read it through instead of importing the constant directly.
 */
export const BUSINESS_TIME_ZONE = 'Europe/Amsterdam';

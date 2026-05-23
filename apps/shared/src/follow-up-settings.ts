/**
 * Wire-format types for `GET /api/me/follow-up-settings` and
 * `PATCH /api/me/follow-up-settings`.
 * Per-org cadence + cap for the silence-check-in scheduler + per-org auto-cold
 * threshold. Owner-only because the settings affect everyone in the org's mailbox
 * flow. Setting `maxCount = 0` disables the scheduler entirely; setting
 * `coldAfterDays = 0` disables the auto-cold cron.
 */

export interface FollowUpSettings {
	/** Days of silence after the last sent reply before a check-in fires. 1–30. */
	cadenceDays: number;
	/** Max automatic check-ins per opportunity. 0 disables the scheduler entirely. 0–5. */
	maxCount: number;
	/** Days a REPLIED opportunity stays open after the check-in budget runs out
	 *  before the auto-cold cron flips it to COLD. 0 disables auto-cold; 90 max. */
	coldAfterDays: number;
}

export interface UpdateFollowUpSettingsInput {
	cadenceDays: number;
	maxCount: number;
	coldAfterDays: number;
}

export const FOLLOW_UP_CADENCE_DAYS_MIN = 1;
export const FOLLOW_UP_CADENCE_DAYS_MAX = 30;
export const FOLLOW_UP_MAX_COUNT_MIN = 0;
export const FOLLOW_UP_MAX_COUNT_MAX = 5;
export const FOLLOW_UP_COLD_AFTER_DAYS_MIN = 0;
export const FOLLOW_UP_COLD_AFTER_DAYS_MAX = 90;

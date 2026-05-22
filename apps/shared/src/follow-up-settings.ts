/**
 * Wire-format types for `GET /api/me/follow-up-settings` and
 * `PATCH /api/me/follow-up-settings`.
 * Per-org cadence + cap for the silence-check-in scheduler. Owner-only because
 * the settings affect everyone in the org's mailbox flow. Setting `maxCount = 0`
 * disables the scheduler entirely for the org.
 */

export interface FollowUpSettings {
	/** Days of silence after the last sent reply before a check-in fires. 1–30. */
	cadenceDays: number;
	/** Max automatic check-ins per opportunity. 0 disables the scheduler entirely. 0–5. */
	maxCount: number;
}

export interface UpdateFollowUpSettingsInput {
	cadenceDays: number;
	maxCount: number;
}

export const FOLLOW_UP_CADENCE_DAYS_MIN = 1;
export const FOLLOW_UP_CADENCE_DAYS_MAX = 30;
export const FOLLOW_UP_MAX_COUNT_MIN = 0;
export const FOLLOW_UP_MAX_COUNT_MAX = 5;

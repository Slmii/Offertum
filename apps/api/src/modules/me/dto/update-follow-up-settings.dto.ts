import {
	FOLLOW_UP_CADENCE_DAYS_MAX,
	FOLLOW_UP_CADENCE_DAYS_MIN,
	FOLLOW_UP_COLD_AFTER_DAYS_MAX,
	FOLLOW_UP_COLD_AFTER_DAYS_MIN,
	FOLLOW_UP_MAX_COUNT_MAX,
	FOLLOW_UP_MAX_COUNT_MIN,
	type UpdateFollowUpSettingsInput
} from '@offertum/shared';
import { IsInt, Max, Min } from 'class-validator';

/**
 * Request body for `PATCH /api/me/follow-up-settings`. Bounds mirror the migration's
 * CHECK constraints — `class-validator` rejects out-of-range values before the DB
 * write would have failed anyway.
 */
export class UpdateFollowUpSettingsDto implements UpdateFollowUpSettingsInput {
	@IsInt()
	@Min(FOLLOW_UP_CADENCE_DAYS_MIN)
	@Max(FOLLOW_UP_CADENCE_DAYS_MAX)
	cadenceDays!: number;

	@IsInt()
	@Min(FOLLOW_UP_MAX_COUNT_MIN)
	@Max(FOLLOW_UP_MAX_COUNT_MAX)
	maxCount!: number;

	@IsInt()
	@Min(FOLLOW_UP_COLD_AFTER_DAYS_MIN)
	@Max(FOLLOW_UP_COLD_AFTER_DAYS_MAX)
	coldAfterDays!: number;
}

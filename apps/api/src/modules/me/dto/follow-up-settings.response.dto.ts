import type { FollowUpSettings } from '@offertum/shared';

/**
 * Response for `GET /api/me/follow-up-settings` and `PATCH /api/me/follow-up-settings`.
 * Concrete class (not interface) so the OpenAPI spec carries the shape at runtime.
 */
export class FollowUpSettingsResponseDto implements FollowUpSettings {
	cadenceDays!: number;
	maxCount!: number;
	coldAfterDays!: number;
}

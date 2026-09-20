import { WEEKLY_DIGEST_DAYS, type UpdateNotificationSettingsInput, type WeeklyDigestDay } from '@offertum/shared';
import { IsBoolean, IsIn, Matches } from 'class-validator';

// Single-digit hours tolerated ("8:00"); the service re-validates + clamps via hhmmToMinutes.
const HHMM = /^([01]?\d|2[0-3]):[0-5]\d$/;

export class UpdateNotificationSettingsDto implements UpdateNotificationSettingsInput {
	@IsIn(WEEKLY_DIGEST_DAYS)
	weeklyDigestDay!: WeeklyDigestDay;

	@Matches(HHMM, { message: 'weeklyDigestTime must be HH:MM' })
	weeklyDigestTime!: string;

	@Matches(HHMM, { message: 'quietHoursStart must be HH:MM' })
	quietHoursStart!: string;

	@Matches(HHMM, { message: 'quietHoursEnd must be HH:MM' })
	quietHoursEnd!: string;

	@IsBoolean()
	quietHoursEnabled!: boolean;
}

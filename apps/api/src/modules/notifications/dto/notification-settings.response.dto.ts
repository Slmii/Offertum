import type { NotificationSettings, NotificationSettingsResponse, WeeklyDigestDay } from '@offertum/shared';

export class NotificationSettingsDto implements NotificationSettings {
	weeklyDigestDay!: WeeklyDigestDay;
	weeklyDigestTime!: string;
	quietHoursStart!: string;
	quietHoursEnd!: string;
	quietHoursEnabled!: boolean;
}

export class NotificationSettingsResponseDto implements NotificationSettingsResponse {
	settings!: NotificationSettingsDto;
}

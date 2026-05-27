import {
	FOLLOW_UP_CADENCE_DAYS_MAX,
	FOLLOW_UP_CADENCE_DAYS_MIN,
	FOLLOW_UP_COLD_AFTER_DAYS_MAX,
	FOLLOW_UP_COLD_AFTER_DAYS_MIN,
	FOLLOW_UP_MAX_COUNT_MAX,
	FOLLOW_UP_MAX_COUNT_MIN
} from '@offertum/shared';
import z from 'zod';

// HTML `type='number'` inputs emit strings; `z.coerce.number()` converts at parse time
// so consumers always read JS numbers (matches the API payload shape one-to-one).
//
// `cadencePreset` is a UI-only field driving the preset dropdown — it isn't sent to
// the API. Living in the schema keeps it inside the same react-hook-form state as the
// other fields so the Form's `<Select>` component (Controller-wrapped) can own it.
export const FollowUpSettingsSchema = z.object({
	cadenceDays: z.coerce
		.number({ message: 'Vul een geldig aantal dagen in' })
		.int('Vul een heel getal in')
		.min(FOLLOW_UP_CADENCE_DAYS_MIN, `Minimaal ${FOLLOW_UP_CADENCE_DAYS_MIN} dag`)
		.max(FOLLOW_UP_CADENCE_DAYS_MAX, `Maximaal ${FOLLOW_UP_CADENCE_DAYS_MAX} dagen`),
	maxCount: z.coerce
		.number({ message: 'Vul een geldig aantal herinneringen in' })
		.int('Vul een heel getal in')
		.min(FOLLOW_UP_MAX_COUNT_MIN, `Minimaal ${FOLLOW_UP_MAX_COUNT_MIN}`)
		.max(FOLLOW_UP_MAX_COUNT_MAX, `Maximaal ${FOLLOW_UP_MAX_COUNT_MAX}`),
	coldAfterDays: z.coerce
		.number({ message: 'Vul een geldig aantal dagen in' })
		.int('Vul een heel getal in')
		.min(FOLLOW_UP_COLD_AFTER_DAYS_MIN, `Minimaal ${FOLLOW_UP_COLD_AFTER_DAYS_MIN}`)
		.max(FOLLOW_UP_COLD_AFTER_DAYS_MAX, `Maximaal ${FOLLOW_UP_COLD_AFTER_DAYS_MAX}`),
	cadencePreset: z.string()
});

export type FollowUpSettingsForm = z.infer<typeof FollowUpSettingsSchema>;

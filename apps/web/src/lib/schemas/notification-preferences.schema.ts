import { NOTIFICATION_CHANNELS, NOTIFICATION_EVENT_TYPES, isEmailChannelAvailable } from '@offertum/shared';
import z from 'zod';

// The settings form is a per-(eventType × channel) `enabled` boolean grid. Stored as
// a record-shape `{ [key: string]: boolean }`. Separator is `__` (not `.`) because
// react-hook-form treats `.` as a nested-path operator — `name='a.b'` would write to
// `state.a.b`, not the flat string key, so toggling silently writes nowhere visible
// to a `values[flat-key]` reader. Channels disabled for an event (currently email for
// non-digest events) are omitted from the schema so the Form doesn't expect those keys.
const keys: string[] = [];
for (const event of NOTIFICATION_EVENT_TYPES) {
	for (const channel of NOTIFICATION_CHANNELS) {
		if (channel === 'email' && !isEmailChannelAvailable(event)) {
			continue;
		}
		keys.push(`${event}__${channel}`);
	}
}

export const NotificationPreferencesSchema = z.object(
	Object.fromEntries(keys.map(key => [key, z.boolean()])) as Record<string, z.ZodBoolean>
);

export type NotificationPreferencesForm = Record<string, boolean>;

export function preferenceKey(eventType: string, channel: string): string {
	return `${eventType}__${channel}`;
}

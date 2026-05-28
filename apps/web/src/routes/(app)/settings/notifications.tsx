import { SectionError } from '@/components/SectionError.component';
import { Form } from '@/components/Form/Form.component';
import { Switch } from '@/components/Form/Switch/Switch.component';
import {
	notificationPreferencesQueryOptions,
	useUpdateNotificationPreferences
} from '@/lib/queries/notifications.queries';
import {
	NotificationPreferencesSchema,
	preferenceKey,
	type NotificationPreferencesForm
} from '@/lib/schemas/notification-preferences.schema';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import {
	NOTIFICATION_CHANNELS,
	NOTIFICATION_EVENT_TYPES,
	isEmailChannelAvailable,
	type NotificationChannel,
	type NotificationEventType,
	type UpdateNotificationPreferencesInput
} from '@offertum/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';

const EVENT_LABELS_NL: Record<NotificationEventType, { title: string; description: string }> = {
	opportunity_created: {
		title: 'Nieuwe offerteaanvraag',
		description: 'Een nieuwe aanvraag is binnengekomen in een verbonden mailbox.'
	},
	customer_reply: {
		title: 'Reactie van klant',
		description: 'Een klant heeft gereageerd op een lopende offerteaanvraag.'
	},
	opportunity_auto_cold: {
		title: 'Aanvraag automatisch koud gezet',
		description: 'Een offerteaanvraag is na de stilteperiode automatisch op Koud gezet.'
	},
	weekly_digest: {
		title: 'Wekelijks overzicht',
		description: 'Maandagochtend 08:00, samenvatting van open + koude offerteaanvragen.'
	}
};

const CHANNEL_LABELS_NL: Record<NotificationChannel, string> = {
	in_app: 'In de app',
	email: 'E-mail'
};

export const Route = createFileRoute('/(app)/settings/notifications')({
	loader: ({ context }) => context.queryClient.ensureQueryData(notificationPreferencesQueryOptions),
	component: NotificationsSettingsPage,
	errorComponent: SectionError
});

function buildDefaults(
	preferences: ReadonlyArray<{ eventType: NotificationEventType; channel: NotificationChannel; enabled: boolean }>
): NotificationPreferencesForm {
	// Index the stored preferences once (O(1) lookups) instead of a `.find` per cell.
	const storedByKey = new Map<string, boolean>();
	for (const p of preferences) {
		storedByKey.set(preferenceKey(p.eventType, p.channel), p.enabled);
	}

	const map: NotificationPreferencesForm = {};
	for (const event of NOTIFICATION_EVENT_TYPES) {
		for (const channel of NOTIFICATION_CHANNELS) {
			if (channel === 'email' && !isEmailChannelAvailable(event)) {
				continue;
			}
			const key = preferenceKey(event, channel);
			map[key] = storedByKey.get(key) ?? true;
		}
	}
	return map;
}

function NotificationsSettingsPage() {
	const { data } = useSuspenseQuery(notificationPreferencesQueryOptions);
	const update = useUpdateNotificationPreferences();
	const [savedFlash, setSavedFlash] = useState(false);

	const onSubmit = (values: NotificationPreferencesForm) => {
		const input: UpdateNotificationPreferencesInput = {
			preferences: NOTIFICATION_EVENT_TYPES.flatMap(event =>
				// Single pass: flatMap emits the row or drops it, instead of filter().map().
				NOTIFICATION_CHANNELS.flatMap(channel =>
					channel === 'email' && !isEmailChannelAvailable(event)
						? []
						: [
								{
									eventType: event,
									channel,
									enabled: values[preferenceKey(event, channel)] === true
								}
							]
				)
			)
		};
		update.mutate(input, {
			onSuccess: () => {
				setSavedFlash(true);
				window.setTimeout(() => setSavedFlash(false), 2500);
			}
		});
	};

	return (
		<Container maxWidth='sm' sx={{ py: 6 }}>
			<Box sx={{ mb: 6 }}>
				<Typography variant='h4' component='h1' sx={{ mb: 2 }}>
					Notificaties
				</Typography>
				<Typography variant='body2' sx={{ color: 'text.secondary', maxWidth: 480 }}>
					Bepaal per gebeurtenis hoe je op de hoogte gehouden wilt worden. Notificaties zijn alleen
					informatief, niets wordt automatisch verstuurd of geaccepteerd.
				</Typography>
			</Box>

			<Paper variant='outlined' sx={{ p: 6, borderRadius: 2 }}>
				<Form<NotificationPreferencesForm>
					action={onSubmit}
					schema={NotificationPreferencesSchema}
					defaultValues={buildDefaults(data.preferences)}
				>
					<Stack spacing={3}>
						{NOTIFICATION_EVENT_TYPES.map(event => (
							<Box key={event}>
								<Typography sx={{ fontWeight: 500, mb: 0.5 }}>
									{EVENT_LABELS_NL[event].title}
								</Typography>
								<Typography variant='caption' color='text.secondary' sx={{ display: 'block', mb: 1 }}>
									{EVENT_LABELS_NL[event].description}
								</Typography>
								<Stack direction='row' spacing={3}>
									{NOTIFICATION_CHANNELS.flatMap(channel =>
										channel === 'email' && !isEmailChannelAvailable(event)
											? []
											: [
													<Switch
														key={channel}
														name={preferenceKey(event, channel)}
														label={CHANNEL_LABELS_NL[channel]}
													/>
												]
									)}
								</Stack>
							</Box>
						))}

						{update.error && (
							<Alert severity='error'>
								{update.error instanceof Error ? update.error.message : 'Opslaan mislukt.'}
							</Alert>
						)}
						{savedFlash && <Alert severity='success'>Opgeslagen.</Alert>}

						<Stack direction='row' spacing={1} sx={{ justifyContent: 'flex-end' }}>
							<Button type='submit' variant='contained' disabled={update.isPending}>
								{update.isPending ? 'Opslaan…' : 'Opslaan'}
							</Button>
						</Stack>
					</Stack>
				</Form>
			</Paper>
		</Container>
	);
}

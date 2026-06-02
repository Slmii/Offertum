// apps/web/src/routes/(app)/settings/calendar.tsx
import { BackToHomeButton } from '@/components/BackToHomeButton.component';
import {
	calendarFeedQueryOptions,
	useGenerateCalendarFeed,
	useRevokeCalendarFeed
} from '@/lib/queries/calendar.queries';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/(app)/settings/calendar')({
	loader: ({ context }) => context.queryClient.ensureQueryData(calendarFeedQueryOptions),
	component: CalendarSettingsPage
});

function CalendarSettingsPage() {
	const { data: feed } = useSuspenseQuery(calendarFeedQueryOptions);
	const generate = useGenerateCalendarFeed();
	const revoke = useRevokeCalendarFeed();

	return (
		<Container sx={{ py: 3, maxWidth: 640 }}>
			<BackToHomeButton />
			<Typography variant='h1' sx={{ fontSize: 28, mt: 2, mb: 1 }}>
				Agenda-abonnement
			</Typography>
			<Typography variant='body2' color='text.secondary' sx={{ mb: 3 }}>
				Abonneer je agenda-app (Apple Agenda, Google Calendar) op deze link om je offertes,
				deadlines en afspraken automatisch te zien.
			</Typography>

			<Alert severity='warning' sx={{ mb: 3 }}>
				Iedereen met deze link kan je agenda-items zien (klantnaam + type aanvraag). Deel hem
				niet en vernieuw de link als je hem per ongeluk hebt gedeeld.
			</Alert>

			{feed.url ? (
				<Stack spacing={2}>
					<TextField
						label='Abonnement-URL'
						value={feed.url}
						slotProps={{ input: { readOnly: true } }}
						fullWidth
						onFocus={event => event.target.select()}
					/>
					<Stack direction='row' spacing={2}>
						<Button variant='outlined' onClick={() => void navigator.clipboard.writeText(feed.url ?? '')}>
							Kopiëren
						</Button>
						<Button variant='outlined' onClick={() => generate.mutate()} disabled={generate.isPending}>
							Vernieuwen
						</Button>
						<Button color='error' variant='outlined' onClick={() => revoke.mutate()} disabled={revoke.isPending}>
							Intrekken
						</Button>
					</Stack>
				</Stack>
			) : (
				<Button variant='contained' onClick={() => generate.mutate()} disabled={generate.isPending}>
					Abonnement aanmaken
				</Button>
			)}
		</Container>
	);
}

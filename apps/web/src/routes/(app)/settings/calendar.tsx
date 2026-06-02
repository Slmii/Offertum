// apps/web/src/routes/(app)/settings/calendar.tsx
import { BackToHomeButton } from '@/components/BackToHomeButton.component';
import { billingStatusQueryOptions, isBillingEntitled } from '@/lib/queries/billing.queries';
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
import { myMembershipQueryOptions } from '@/lib/queries/team.queries';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useState } from 'react';

export const Route = createFileRoute('/(app)/settings/calendar')({
	// iCal phone-sync setup is subscription-gated (the in-app calendar view is NOT). Bounce
	// non-entitled orgs before the feed-token read fires (the API also 402s the token endpoints).
	// Owners go to /billing to fix it; non-owners can't access /billing (owner-only), so send them
	// home to avoid a /billing → / double-redirect dead-end.
	beforeLoad: async ({ context }) => {
		const status = await context.queryClient.ensureQueryData(billingStatusQueryOptions);
		if (!isBillingEntitled(status.state)) {
			const me = await context.queryClient.ensureQueryData(myMembershipQueryOptions);
			throw redirect({ to: me.role === 'OWNER' ? '/billing' : '/' });
		}
	},
	loader: ({ context }) => context.queryClient.ensureQueryData(calendarFeedQueryOptions),
	component: CalendarSettingsPage
});

function CalendarSettingsPage() {
	const { data: feed } = useSuspenseQuery(calendarFeedQueryOptions);
	const generate = useGenerateCalendarFeed();
	const revoke = useRevokeCalendarFeed();
	const [copied, setCopied] = useState(false);

	// `navigator.clipboard` is undefined on insecure (non-HTTPS) origins — guard before calling.
	const copyFeedUrl = () => {
		if (!feed.url || !navigator.clipboard) {
			return;
		}
		void navigator.clipboard.writeText(feed.url).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		});
	};

	return (
		<Container sx={{ py: 3, maxWidth: 640 }}>
			<BackToHomeButton />
			<Typography variant='h1' sx={{ fontSize: 28, mt: 2, mb: 1 }}>
				Agenda-abonnement
			</Typography>
			<Typography variant='body2' color='text.secondary' sx={{ mb: 3 }}>
				Abonneer je agenda-app (Apple Agenda, Google Calendar) op deze link om alle offertes, deadlines en
				afspraken van je organisatie automatisch te zien. Hoe vaak je agenda-app ververst bepaalt je telefoon
				zelf; bij Google Calendar kan het enkele uren duren voordat nieuwe items verschijnen.
			</Typography>

			<Alert severity='warning' sx={{ mb: 3 }}>
				Iedereen met deze link kan je agenda-items zien (klantnaam + type aanvraag). Deel hem niet en vernieuw
				de link als je hem per ongeluk hebt gedeeld.
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
						<Button variant='outlined' onClick={copyFeedUrl}>
							{copied ? 'Gekopieerd' : 'Kopiëren'}
						</Button>
						<Button variant='outlined' onClick={() => generate.mutate()} disabled={generate.isPending}>
							Vernieuwen
						</Button>
						<Button
							color='error'
							variant='outlined'
							onClick={() => revoke.mutate()}
							disabled={revoke.isPending}
						>
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

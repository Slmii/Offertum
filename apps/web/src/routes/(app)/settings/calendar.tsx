// apps/web/src/routes/(app)/settings/calendar.tsx
import { BackToHomeButton } from '@/components/BackToHomeButton.component';
import { billingStatusQueryOptions, isBillingEntitled } from '@/lib/queries/billing.queries';
import {
	calendarFeedQueryOptions,
	useGenerateCalendarFeed,
	useRevokeCalendarFeed
} from '@/lib/queries/calendar.queries';
import { myMembershipQueryOptions } from '@/lib/queries/team.queries';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';

export const Route = createFileRoute('/(app)/settings/calendar')({
	// Billing + membership are always prefetched so the component can render either the locked
	// state or the token-management UI without an extra waterfall. The calendar feed token is
	// subscription-gated (the API also 402s those endpoints), so we only prefetch it when the
	// org is entitled — non-entitled orgs see the locked upsell card instead.
	loader: async ({ context }) => {
		const [status, me] = await Promise.all([
			context.queryClient.ensureQueryData(billingStatusQueryOptions),
			context.queryClient.ensureQueryData(myMembershipQueryOptions)
		]);

		if (isBillingEntitled(status.state)) {
			await context.queryClient.ensureQueryData(calendarFeedQueryOptions);
		}

		return { status, me };
	},
	component: CalendarSettingsPage
});

function CalendarSettingsPage() {
	const { data: billing } = useSuspenseQuery(billingStatusQueryOptions);
	const { data: me } = useSuspenseQuery(myMembershipQueryOptions);
	const isEntitled = isBillingEntitled(billing.state);
	const isOwner = me.role === 'OWNER';

	return (
		<Container sx={{ py: 3, maxWidth: 640 }}>
			<BackToHomeButton />
			<Typography variant='h1' sx={{ fontSize: 28, mt: 2, mb: 1 }}>
				Agenda-synchronisatie
			</Typography>

			{isEntitled ? (
				<CalendarFeedManager />
			) : (
				<CalendarUpsell isOwner={isOwner} />
			)}
		</Container>
	);
}

/** Locked-state card shown to non-entitled orgs. Owner sees an Abonneren CTA; non-owners see
 * a prompt to contact the owner. */
function CalendarUpsell({ isOwner }: { isOwner: boolean }) {
	return (
		<Paper variant='outlined' sx={{ p: 3, mt: 2 }}>
			<Stack useFlexGap spacing={2}>
				<Stack direction='row' useFlexGap spacing={1} sx={{ alignItems: 'center' }}>
					<LockGlyph />
					<Typography variant='h6' component='h2' sx={{ fontWeight: 600 }}>
						Agenda-synchronisatie
					</Typography>
				</Stack>

				<Typography variant='body2' color='text.secondary'>
					Met een abonnement synchroniseer je je offerte-deadlines, afspraken en verloopdatums automatisch
					met de agenda op je telefoon (Apple/Google Agenda).
				</Typography>

				{isOwner ? (
					<Box>
						<Button component={Link} to='/billing' variant='contained' size='small'>
							Abonneren
						</Button>
					</Box>
				) : (
					<Typography variant='body2' color='text.secondary'>
						Vraag de eigenaar om een abonnement.
					</Typography>
				)}
			</Stack>
		</Paper>
	);
}

/** Token-management UI shown to entitled orgs — unchanged from the original page. */
function CalendarFeedManager() {
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
		<>
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
		</>
	);
}

function LockGlyph() {
	return (
		<svg
			xmlns='http://www.w3.org/2000/svg'
			width='18'
			height='18'
			viewBox='0 0 24 24'
			fill='currentColor'
			aria-hidden='true'
			style={{ color: 'inherit', opacity: 0.54, flexShrink: 0 }}
		>
			<path d='M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z' />
		</svg>
	);
}

import { Banner } from '@/components/Banner.component';
import { PageHeader } from '@/components/PageHeader.component';
import { SubscribeCta } from '@/components/SubscribeCta.component';
import { BodySmall, H3 } from '@/components/Text.component';
import { LockGlyph } from '@/components/UpsellTeaser.component';
import { billingStatusQueryOptions, isBillingEntitled } from '@/lib/queries/billing.queries';
import {
	calendarFeedQueryOptions,
	useGenerateCalendarFeed,
	useRevokeCalendarFeed
} from '@/lib/queries/calendar.queries';
import { myMembershipQueryOptions } from '@/lib/queries/team.queries';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
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
		<Stack>
			<PageHeader
				title='Agenda-synchronisatie'
				caption='Abonneer je agenda-app (Apple Agenda, Google Calendar) op deze link om alle offertes, deadlines en afspraken van je organisatie automatisch te zien. Hoe vaak je agenda-app ververst bepaalt je telefoon zelf; bij Google Calendar kan het enkele uren duren voordat nieuwe items verschijnen.'
			/>

			{isEntitled ? <CalendarFeedManager /> : <CalendarUpsell isOwner={isOwner} />}
		</Stack>
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
					<H3 component='h2' fontWeight='bold'>
						Agenda-synchronisatie
					</H3>
				</Stack>

				<BodySmall color='text.secondary'>
					Met een abonnement synchroniseer je je offerte-deadlines, afspraken en verloopdatums automatisch met
					de agenda op je telefoon (Apple/Google Agenda).
				</BodySmall>

				<SubscribeCta isOwner={isOwner} />
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
			<Banner tone='warning' sx={{ mb: 3 }}>
				Iedereen met deze link kan je agenda-items zien (klantnaam + type aanvraag). Deel hem niet en vernieuw
				de link als je hem per ongeluk hebt gedeeld.
			</Banner>

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

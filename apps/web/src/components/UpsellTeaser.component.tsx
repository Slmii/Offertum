import { SubscribeCta } from '@/components/SubscribeCta.component';
import { BodySmall, H3 } from '@/components/Text.component';
import { billingStatusQueryOptions, isBillingEntitled } from '@/lib/queries/billing.queries';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import { useSuspenseQuery } from '@tanstack/react-query';

const VALUE_PROPS = [
	'Dagelijks overzicht van je belangrijkste offerteaanvragen',
	'Slimme acties voordat een offerte verloopt',
	'Inzicht in je reactiesnelheid en winkans'
] as const;

/**
 * Upsell teaser for W13 features (daily digest, smart expiry, pattern banners).
 * Rendered on the dashboard only when the org is NOT entitled (no active subscription).
 * Entitled orgs see the real `PatternBanners` instead — these two components never both
 * render at the same time.
 *
 * Owner sees an "Abonneren" CTA that links to /billing. Non-owners see an "ask the owner"
 * text line instead (they cannot reach /billing — OwnerGuard blocks it on the API too).
 */
export function UpsellTeaser({ isOwner }: { isOwner: boolean }) {
	const { data: billing } = useSuspenseQuery(billingStatusQueryOptions);

	if (isBillingEntitled(billing.state)) {
		return null;
	}

	return (
		<Paper variant='outlined' sx={{ p: 3 }}>
			<Stack useFlexGap spacing={2}>
				<Stack direction='row' useFlexGap spacing={1} sx={{ alignItems: 'center' }}>
					<LockGlyph />
					<H3 component='h2'>Slimme prioritering</H3>
				</Stack>

				<BodySmall color='textSecondary'>Met een abonnement krijg je:</BodySmall>

				<Stack useFlexGap spacing={0.5}>
					{VALUE_PROPS.map(prop => (
						<Stack key={prop} direction='row' useFlexGap spacing={1} sx={{ alignItems: 'flex-start' }}>
							<Box component='span' aria-hidden='true' sx={{ flexShrink: 0, lineHeight: '1.43' }}>
								•
							</Box>
							<BodySmall>{prop}</BodySmall>
						</Stack>
					))}
				</Stack>

				<SubscribeCta
					isOwner={isOwner}
					askOwnerText='Vraag de eigenaar van je organisatie om een abonnement.'
				/>
			</Stack>
		</Paper>
	);
}

export function LockGlyph({ size = 18 }: { size?: number }) {
	return (
		<svg
			xmlns='http://www.w3.org/2000/svg'
			width={size}
			height={size}
			viewBox='0 0 24 24'
			fill='currentColor'
			aria-hidden='true'
			style={{ color: 'inherit', opacity: 0.54, flexShrink: 0 }}
		>
			<path d='M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z' />
		</svg>
	);
}

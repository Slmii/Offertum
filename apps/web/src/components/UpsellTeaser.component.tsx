import { SubscribeCta } from '@/components/SubscribeCta.component';
import { BodySmall, H2 } from '@/components/Text.component';
import { UpsellCheckItem } from '@/components/UpsellCheckItem.component';
import { UpsellLockTile } from '@/components/UpsellLockTile.component';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';

const VALUE_PROPS = [
	'Dagelijks overzicht van je belangrijkste offerteaanvragen',
	'Slimme acties voordat een offerte verloopt',
	'Inzicht in je reactiesnelheid en winkans'
] as const;

/**
 * Upsell teaser for W13 features (daily digest, smart expiry, pattern banners) — the design's
 * `UpsellTeaser`. Presentational: the caller decides when to render it (only when NOT entitled);
 * entitled orgs see the real feature (`OppInsights`) instead.
 *
 * Owner sees an "Abonneren" CTA that links to /billing. Non-owners see an "ask the owner" line
 * instead (they cannot reach /billing — OwnerGuard blocks it on the API too).
 */
export function UpsellTeaser({ isOwner }: { isOwner: boolean }) {
	return (
		<Paper variant='outlined' sx={{ p: 3 }}>
			<Stack direction='row' useFlexGap spacing={2.25} sx={{ alignItems: 'flex-start' }}>
				<UpsellLockTile />

				<Box sx={{ flex: 1, minWidth: 0 }}>
					<H2 component='h2' sx={{ m: 0 }}>
						Slimme prioritering
					</H2>
					<BodySmall color='textSecondary' sx={{ display: 'block', mt: 0.5, mb: 2 }}>
						Met een abonnement krijg je:
					</BodySmall>

					<Stack useFlexGap spacing={1.25}>
						{VALUE_PROPS.map(prop => (
							<UpsellCheckItem key={prop}>{prop}</UpsellCheckItem>
						))}
					</Stack>

					<SubscribeCta
						isOwner={isOwner}
						sx={{ mt: 2.5 }}
						askOwnerText='Vraag de eigenaar van je organisatie om een abonnement.'
					/>
				</Box>
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

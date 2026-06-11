import { billingStatusQueryOptions, isBillingEntitled } from '@/lib/queries/billing.queries';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';

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
		<Paper variant='outlined' sx={{ p: 3, mb: 3 }}>
			<Stack useFlexGap spacing={2}>
				<Stack direction='row' useFlexGap spacing={1} sx={{ alignItems: 'center' }}>
					<LockGlyph />
					<Typography variant='h6' component='h2' sx={{ fontWeight: 600 }}>
						Slimme prioritering
					</Typography>
				</Stack>

				<Typography variant='body2' color='text.secondary'>
					Met een abonnement krijg je:
				</Typography>

				<Stack useFlexGap spacing={0.5}>
					{VALUE_PROPS.map(prop => (
						<Stack key={prop} direction='row' useFlexGap spacing={1} sx={{ alignItems: 'flex-start' }}>
							<Box
								component='span'
								aria-hidden='true'
								sx={{ color: 'text.secondary', flexShrink: 0, lineHeight: '1.43' }}
							>
								•
							</Box>
							<Typography variant='body2'>{prop}</Typography>
						</Stack>
					))}
				</Stack>

				{isOwner ? (
					<Box>
						<Button component={Link} to='/billing' variant='contained' size='small'>
							Abonneren
						</Button>
					</Box>
				) : (
					<Typography variant='body2' color='text.secondary'>
						Vraag de eigenaar van je organisatie om een abonnement.
					</Typography>
				)}
			</Stack>
		</Paper>
	);
}

export function LockGlyph() {
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

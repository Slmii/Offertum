import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import type { SxProps, Theme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { Link } from '@tanstack/react-router';

/**
 * The shared "Abonneren / Vraag de eigenaar" call-to-action used by every upsell
 * surface (dashboard teaser, calendar sync, locked reply panel, list empty state).
 * Owners get a button to /billing; non-owners get the ask-the-owner line instead —
 * they cannot reach /billing (OwnerGuard blocks it on the API too).
 */
export function SubscribeCta({
	askOwnerText = 'Vraag de eigenaar om een abonnement.',
	isOwner,
	sx
}: {
	askOwnerText?: string;
	isOwner: boolean;
	sx?: SxProps<Theme>;
}) {
	if (!isOwner) {
		return (
			<Typography variant='body2' color='text.secondary' sx={sx}>
				{askOwnerText}
			</Typography>
		);
	}

	return (
		<Box sx={sx}>
			<Button component={Link} to='/billing' variant='contained' size='small'>
				Abonneren
			</Button>
		</Box>
	);
}

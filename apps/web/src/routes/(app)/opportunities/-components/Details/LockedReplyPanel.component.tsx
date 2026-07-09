import { SubscribeCta } from '@/components/SubscribeCta.component';
import { BodySmall, H2 } from '@/components/Text.component';
import { UpsellLockTile } from '@/components/UpsellLockTile.component';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';

/**
 * Shown in the reply-draft area when the org has no active subscription (the design's
 * `LockedReplyPanel`). Centered accent lock tile + title + copy + the shared CTA. Owners get a
 * direct "Abonneren" button; non-owners see a muted ask-the-owner line.
 */
export function LockedReplyPanel({ isOwner }: { isOwner: boolean }) {
	return (
		<Paper
			variant='outlined'
			sx={{ py: 4, px: 3.5, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}
		>
			<Box sx={{ mb: 2 }}>
				<UpsellLockTile size={48} />
			</Box>

			<H2 component='h2' sx={{ m: 0 }}>
				Abonneer om te versturen
			</H2>
			<BodySmall color='textSecondary' sx={{ display: 'block', mt: 1, mb: 2.5, maxWidth: 380, lineHeight: 1.55 }}>
				Abonneer om antwoorden te versturen en deze aanvraag op te volgen.
			</BodySmall>

			<SubscribeCta isOwner={isOwner} askOwnerText='Vraag de eigenaar van je organisatie om een abonnement.' />
		</Paper>
	);
}

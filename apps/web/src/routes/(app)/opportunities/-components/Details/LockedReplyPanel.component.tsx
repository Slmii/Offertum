import { SubscribeCta } from '@/components/SubscribeCta.component';
import { BodySmall, Label } from '@/components/Text.component';
import { LockGlyph } from '@/components/UpsellTeaser.component';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';

/**
 * Shown in the reply-draft area when the org has no active subscription.
 * Owners get a direct "Abonneren" CTA; non-owners see a muted ask-the-owner line.
 * Mirrors the LockGlyph + copy + CTA pattern from the UpsellTeaser.
 */
export function LockedReplyPanel({ isOwner }: { isOwner: boolean }) {
	return (
		<Paper
			variant='outlined'
			sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 1.5, alignItems: 'flex-start' }}
		>
			<Stack direction='row' useFlexGap spacing={1} sx={{ alignItems: 'center' }}>
				<LockGlyph />
				<Label fontWeight='bold'>Abonneer om te versturen</Label>
			</Stack>
			<BodySmall color='textSecondary'>
				Abonneer om antwoorden te versturen en deze aanvraag op te volgen.
			</BodySmall>
			<SubscribeCta isOwner={isOwner} />
		</Paper>
	);
}

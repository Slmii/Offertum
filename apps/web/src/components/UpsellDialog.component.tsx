import { AppIcon } from '@/components/AppIcon.component';
import { Dialog } from '@/components/Dialog.component';
import { BodySmall } from '@/components/Text.component';
import { UpsellCheckItem } from '@/components/UpsellCheckItem.component';
import { UpsellLockTile } from '@/components/UpsellLockTile.component';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import { Link } from '@tanstack/react-router';

interface UpsellDialogProps {
	/** Dialog header, e.g. "Abonneer voor je catalogus". */
	title: string;
	/** Paragraph shown next to the lock tile. */
	description: string;
	/** Value-prop bullets rendered as check items. */
	items: readonly string[];
	isOpen: boolean;
	isOwner: boolean;
	onClose: () => void;
}

/**
 * Modal variant of the upsell — the design's "Abonneer in je agenda" dialog: a lock tile +
 * description, check-listed value props, and an Annuleren / Abonneren footer. Reuses the same
 * `UpsellLockTile` + `UpsellCheckItem` primitives as the inline `UpsellTeaser`, so every gated
 * surface (page teaser AND action modal) stays visually identical.
 *
 * Rendered unconditionally with `isOpen` (per the dialog convention) so the close transition
 * survives. Owner gets the Abonneren button (→ /billing); a non-owner gets an "ask the owner"
 * line instead — they can't reach /billing (OwnerGuard blocks it on the API too).
 */
export function UpsellDialog({ title, description, items, isOpen, isOwner, onClose }: UpsellDialogProps) {
	return (
		<Dialog
			open={isOpen}
			onClose={onClose}
			title={title}
			action={
				<>
					<Button onClick={onClose}>Annuleren</Button>
					{isOwner && (
						<Button
							component={Link}
							to='/billing'
							variant='contained'
							startIcon={<AppIcon name='arrow-right' size='small' />}
						>
							Abonneren
						</Button>
					)}
				</>
			}
		>
			<Stack useFlexGap spacing={2.5}>
				<Stack direction='row' useFlexGap spacing={2.25} sx={{ alignItems: 'flex-start' }}>
					<UpsellLockTile />
					<BodySmall color='textSecondary' sx={{ lineHeight: 1.55 }}>
						{description}
					</BodySmall>
				</Stack>

				<Stack useFlexGap spacing={1.25}>
					{items.map(item => (
						<UpsellCheckItem key={item}>{item}</UpsellCheckItem>
					))}
				</Stack>

				{!isOwner && (
					<BodySmall color='textSecondary'>
						Vraag de eigenaar van je organisatie om een abonnement.
					</BodySmall>
				)}
			</Stack>
		</Dialog>
	);
}

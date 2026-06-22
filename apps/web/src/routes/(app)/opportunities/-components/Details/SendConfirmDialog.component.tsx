import { Dialog } from '@/components/Dialog.component';
import { BodySmall } from '@/components/Text.component';
import { toReadableBytes } from '@/lib/utils/number.utils';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import type { ReplyDraftAttachment } from '@offertum/shared';

/** Confirmation modal shown before a reply draft is sent to the customer. */
export function SendConfirmDialog({
	isOpen,
	recipientName,
	recipientEmail,
	subject,
	bodyPreview,
	attachments,
	isSending,
	onClose,
	onConfirm
}: {
	isOpen: boolean;
	recipientName: string | null;
	recipientEmail: string | null;
	subject: string | null;
	bodyPreview: string;
	attachments: ReplyDraftAttachment[];
	isSending: boolean;
	onClose: () => void;
	onConfirm: () => void;
}) {
	const recipientLabel = recipientEmail
		? recipientName
			? `${recipientName} <${recipientEmail}>`
			: recipientEmail
		: '(onbekende ontvanger)';
	const preview = bodyPreview.length > 280 ? `${bodyPreview.slice(0, 280)}…` : bodyPreview;

	return (
		<Dialog
			open={isOpen}
			title='Concept versturen?'
			onClose={onClose}
			disableClose={isSending}
			width={600}
			action={
				<>
					<Button onClick={onClose} disabled={isSending}>
						Annuleren
					</Button>
					<Button
						onClick={onConfirm}
						variant='contained'
						disabled={isSending}
						startIcon={isSending ? <CircularProgress size={14} /> : null}
					>
						{isSending ? 'Versturen…' : 'Verstuur nu'}
					</Button>
				</>
			}
		>
			<BodySmall color='textSecondary' sx={{ mb: 2 }}>
				Dit verstuurt direct als antwoord op de oorspronkelijke e-mail. Je kunt het niet terugnemen.
			</BodySmall>
			<Box sx={{ mb: 2 }}>
				<BodySmall color='textSecondary'>Naar</BodySmall>
				<BodySmall>{recipientLabel}</BodySmall>
			</Box>
			{subject && (
				<Box sx={{ mb: 2 }}>
					<BodySmall color='textSecondary'>Onderwerp</BodySmall>
					<BodySmall>Re: {subject.replace(/^re:\s*/i, '')}</BodySmall>
				</Box>
			)}
			<Box>
				<BodySmall color='textSecondary'>Begin van het bericht</BodySmall>
				<BodySmall
					component='pre'
					sx={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', m: 0, mt: 0.5, color: 'text.primary' }}
				>
					{preview}
				</BodySmall>
			</Box>
			{attachments.length > 0 && (
				<Box sx={{ mt: 2 }}>
					<BodySmall color='textSecondary'>Bijlagen ({attachments.length})</BodySmall>
					<Stack direction='row' useFlexGap spacing={1} sx={{ mt: 0.5, flexWrap: 'wrap', rowGap: 1 }}>
						{attachments.map(attachment => (
							<Chip
								key={attachment.id}
								size='small'
								label={`${attachment.filename} · ${toReadableBytes(attachment.sizeBytes)}`}
							/>
						))}
					</Stack>
				</Box>
			)}
		</Dialog>
	);
}

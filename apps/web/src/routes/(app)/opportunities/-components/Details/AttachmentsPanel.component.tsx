import { AppIcon } from '@/components/AppIcon.component';
import { QuotePdfAttachSelect } from '@/components/QuotePdfAttachSelect.component';
import { BodySmall } from '@/components/Text.component';
import { toReadableBytes } from '@/lib/utils/number.utils';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import type { ReplyDraftAttachment } from '@offertum/shared';
import { useRef } from 'react';

/**
 * Reply-draft attachments card — ported from the design's `AttachmentsSection`. A bordered
 * header ("Bijlagen (N)" + "Bijlage toevoegen") over a body that holds the optional offerte-PDF
 * picker and a chip per attached file (download on click, × to remove). On SENT drafts it
 * collapses to a read-only record (no upload, no delete). Upload/delete failures surface as a
 * toast (handled by the caller's mutation onError).
 */
export function AttachmentsPanel({
	opportunityId,
	attachments,
	readOnly,
	isUploading,
	onUpload,
	deletingId,
	onDelete
}: {
	opportunityId: string;
	attachments: ReplyDraftAttachment[];
	readOnly: boolean;
	isUploading: boolean;
	deletingId: string | null;
	onUpload: (file: File) => void;
	onDelete: (attachmentId: string) => void;
}) {
	const fileInputRef = useRef<HTMLInputElement | null>(null);

	if (readOnly && attachments.length === 0) {
		// Nothing to show on a sent draft with no attachments. Keeping the section
		// hidden avoids confusing "Bijlagen" + empty state copy after send.
		return null;
	}

	return (
		<Paper variant='outlined' sx={{ p: 0, mt: 2, overflow: 'hidden' }}>
			{/* Header band */}
			<Box
				sx={{
					px: 2.5,
					py: 2,
					borderBottom: '1px solid',
					borderColor: 'divider',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					gap: 1.5
				}}
			>
				<Box
					component='span'
					sx={theme => ({
						fontFamily: theme.tokens.font.display,
						fontSize: '1rem',
						fontWeight: 500,
						letterSpacing: '-0.004em',
						color: 'text.primary'
					})}
				>
					Bijlagen ({attachments.length})
				</Box>
				{!readOnly && (
					<>
						<input
							ref={fileInputRef}
							type='file'
							hidden
							multiple
							aria-label='Bijlage uploaden'
							onChange={event => {
								const file = event.target.files?.[0];
								if (file) {
									onUpload(file);
								}
								// Reset so picking the same file again still fires `onChange`.
								event.target.value = '';
							}}
						/>
						<Button
							size='small'
							variant='outlined'
							color='inherit'
							disabled={isUploading}
							startIcon={
								isUploading ? <CircularProgress size={14} /> : <AppIcon name='paperclip' size='small' />
							}
							onClick={() => fileInputRef.current?.click()}
						>
							{isUploading ? 'Uploaden…' : 'Bijlage toevoegen'}
						</Button>
					</>
				)}
			</Box>

			{/* Body */}
			<Stack useFlexGap spacing={2} sx={{ p: 2.5 }}>
				<QuotePdfAttachSelect opportunityId={opportunityId} attachments={attachments} readOnly={readOnly} />
				{attachments.length === 0 ? (
					<BodySmall color='textSecondary'>Geen bijlagen toegevoegd.</BodySmall>
				) : (
					<Stack direction='row' useFlexGap spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
						{attachments.map(attachment => (
							// Download on chip click (opens the file in a new tab); delete via the × only.
							// MUI stops propagation on the delete icon, so removing no longer triggers the
							// download — the previous `component='a'` made every click navigate the anchor.
							<Chip
								key={attachment.id}
								icon={<AppIcon name='file-text' size='small' />}
								label={`${attachment.filename} · ${toReadableBytes(attachment.sizeBytes)}`}
								clickable
								onClick={() =>
									window.open(
										`/api/opportunities/${opportunityId}/reply-draft/attachments/${attachment.id}/download`,
										'_blank',
										'noopener'
									)
								}
								onDelete={readOnly ? undefined : () => onDelete(attachment.id)}
								disabled={deletingId === attachment.id}
								// Pin the chip palette so the clickable hover stays legible (the default
								// hover washes out to ~white, killing contrast with the surface).
								sx={theme => ({
									pl: 1,
									backgroundColor: theme.tokens.color.paper2,
									border: `1px solid ${theme.tokens.color.line}`,
									color: theme.tokens.color.ink2,
									'&:hover': { backgroundColor: theme.tokens.color.paper3 },
									'& .MuiChip-icon': { color: theme.tokens.color.ink3 },
									'& .MuiChip-deleteIcon': {
										color: theme.tokens.color.ink4,
										'&:hover': { color: theme.tokens.color.ink2 }
									}
								})}
							/>
						))}
					</Stack>
				)}
			</Stack>
		</Paper>
	);
}

import { AppIcon } from '@/components/AppIcon.component';
import { BodySmall, Overline } from '@/components/Text.component';
import { toReadableBytes } from '@/lib/utils/number.utils';
import { toReadableInboundAttachmentStatus } from '@/lib/utils/inbound-attachment.utils';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import { useTheme } from '@mui/material/styles';
import type { OpportunityInboundAttachment } from '@offertum/shared';

/**
 * Right-rail "Bijlagen van de klant" card — surfaces the attachments the pipeline found
 * on the opportunity's originating message, and whether Offertum could read them (feeds
 * the extractor) or not. Never renders `extractedText` — the API doesn't send it either.
 * Self-hides when there are no attachments.
 */
export function InboundAttachmentsCard({ attachments }: { attachments: OpportunityInboundAttachment[] }) {
	const { tokens } = useTheme();
	const c = tokens.color;

	if (attachments.length === 0) {
		return null;
	}

	const hasUnreadable = attachments.some(a => a.status !== 'parsed');

	return (
		<Paper variant='outlined' sx={{ p: 2.25 }}>
			<Overline component='div' sx={{ mb: 2 }}>
				Bijlagen van de klant
			</Overline>
			<Stack useFlexGap spacing={1.5}>
				{attachments.map(attachment => (
					<Box key={attachment.id} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
						<Box sx={{ display: 'inline-flex', color: c.ink3, mt: 0.25 }}>
							<AppIcon name='paperclip' size='small' />
						</Box>
						<Box sx={{ minWidth: 0 }}>
							<BodySmall
								fontWeight='medium'
								sx={{
									overflow: 'hidden',
									textOverflow: 'ellipsis',
									whiteSpace: 'nowrap',
									display: 'block'
								}}
							>
								{attachment.filename}
								{attachment.sizeBytes !== null ? ` · ${toReadableBytes(attachment.sizeBytes)}` : ''}
							</BodySmall>
							<BodySmall color='textSecondary'>
								{toReadableInboundAttachmentStatus(attachment.status, attachment.isTruncated)}
							</BodySmall>
						</Box>
					</Box>
				))}
			</Stack>
			{hasUnreadable && (
				<BodySmall color='textSecondary' sx={{ mt: 1.5, display: 'block' }}>
					Open de originele e-mail om deze bijlagen zelf te bekijken.
				</BodySmall>
			)}
		</Paper>
	);
}

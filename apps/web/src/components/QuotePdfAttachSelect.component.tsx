import { StandaloneSelect } from '@/components/Form/Select/Select.component';
import { quoteDraftsQueryOptions, useAttachQuotePdf } from '@/lib/queries/quote-drafts.queries';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { ReplyDraftAttachment } from '@offertum/shared';
import { useSuspenseQuery } from '@tanstack/react-query';

const NONE = '__none__';

/**
 * Dropdown in the reply-draft attachments section to pick which generated quote-PDF
 * version (if any) rides along with the email. At most one PDF version is attached;
 * picking another replaces it, "Geen" detaches. Renders nothing until a version exists.
 */
export function QuotePdfAttachSelect({
	opportunityId,
	attachments,
	readOnly
}: {
	opportunityId: string;
	attachments: ReplyDraftAttachment[];
	readOnly: boolean;
}) {
	const { data } = useSuspenseQuery(quoteDraftsQueryOptions(opportunityId));
	const attach = useAttachQuotePdf(opportunityId);

	if (data.pdfs.length === 0) {
		return null;
	}

	const currentQuotePdfId = attachments.find(attachment => attachment.quotePdfId)?.quotePdfId ?? NONE;

	return (
		<Box sx={{ mb: 1.5 }}>
			<StandaloneSelect
				name='quote-pdf'
				label='Offerte-PDF meesturen'
				value={currentQuotePdfId}
				fullWidth
				size='small'
				disabled={readOnly || attach.isPending}
				options={[
					{ id: NONE, label: 'Geen offerte-PDF' },
					...data.pdfs.map(pdf => ({ id: pdf.id, label: pdf.filename }))
				]}
				onChange={event => attach.mutate(event.target.value === NONE ? null : event.target.value)}
			/>
			{attach.isError && (
				<Typography variant='caption' color='error'>
					Bijwerken mislukt: {attach.error instanceof Error ? attach.error.message : 'Onbekende fout'}
				</Typography>
			)}
		</Box>
	);
}

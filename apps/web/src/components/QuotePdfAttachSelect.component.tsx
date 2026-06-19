import { StandaloneSelect } from '@/components/Form/Select/Select.component';
import { BodySmall } from '@/components/Text.component';
import { quoteDraftsQueryOptions, useAttachQuotePdf } from '@/lib/queries/quote-drafts.queries';
import { toReadableDateTime } from '@/lib/utils/date.utils';
import Box from '@mui/material/Box';
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
	// Newest-first list → highest version number = latest. Disambiguates multiple
	// generations on the same day.
	const versionByPdfId = new Map(data.pdfs.map((pdf, index) => [pdf.id, data.pdfs.length - index]));

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
					...data.pdfs.map((pdf, index) => ({
						id: pdf.id,
						label: `v${data.pdfs.length - index} · ${pdf.filename}`,
						secondaryLabel: toReadableDateTime(pdf.createdAt)
					}))
				]}
				renderValue={value => {
					if (value === NONE) {
						return 'Geen offerte-PDF';
					}
					const pdf = data.pdfs.find(candidate => candidate.id === value);
					return pdf ? `v${versionByPdfId.get(pdf.id)} · ${pdf.filename}` : value;
				}}
				onChange={event => attach.mutate(event.target.value === NONE ? null : event.target.value)}
			/>
			{attach.isError && (
				<BodySmall color='error'>
					Bijwerken mislukt: {attach.error instanceof Error ? attach.error.message : 'Onbekende fout'}
				</BodySmall>
			)}
		</Box>
	);
}

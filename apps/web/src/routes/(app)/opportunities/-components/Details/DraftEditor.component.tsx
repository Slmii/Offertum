import { StandaloneField } from '@/components/Form/Field/Field.component';
import { BodySmall } from '@/components/Text.component';
import { toReadableDateTime } from '@/lib/utils/date.utils';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import { REPLY_DRAFT_BODY_MAX_LENGTH } from '@offertum/shared';

/**
 * Editable reply-draft textarea with character count + autosave status line. Rendered bare
 * (no card) — it sits directly inside the composer body, which provides the framing; the field
 * already carries its own border.
 */
export function DraftEditor({
	body,
	setBody,
	isSaving,
	lastUpdatedIso,
	readOnly
}: {
	body: string;
	setBody: (next: string) => void;
	isSaving: boolean;
	lastUpdatedIso: string;
	readOnly: boolean;
}) {
	return (
		<Box>
			<StandaloneField
				name='draft'
				placeholder='Concept-antwoord verschijnt hier zodra het is opgesteld.'
				multiline
				minRows={12}
				maxRows={300}
				maxLength={REPLY_DRAFT_BODY_MAX_LENGTH}
				readOnly={readOnly}
				fullWidth
				value={body}
				onChange={e => {
					if (!readOnly) {
						setBody(e.target.value);
					}
				}}
			/>
			<Stack
				direction='row'
				useFlexGap
				spacing={1}
				sx={{ mt: 1, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}
			>
				<BodySmall
					color='textSecondary'
					sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, ml: 'auto' }}
				>
					{readOnly ? (
						'Verzonden — alleen-lezen'
					) : isSaving ? (
						<>
							<CircularProgress size={10} /> Opslaan…
						</>
					) : (
						`Laatst gewijzigd ${toReadableDateTime(lastUpdatedIso)}`
					)}
				</BodySmall>
			</Stack>
		</Box>
	);
}

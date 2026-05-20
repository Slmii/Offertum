import { BackToHomeButton } from '@/components/BackToHomeButton.component';
import { StandaloneField } from '@/components/Form/Field/Field.component';
import { tonePlaybookQueryOptions, useUpdateTonePlaybook } from '@/lib/queries/tone-playbook.queries';
import { toReadableDateTime } from '@/lib/utils/date.utils';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { TONE_PLAYBOOK_MAX_LENGTH } from '@quoteom/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

/**
 * W5.2 — Per-user writing-style playbook editor (D31). Free-form prose the user
 * writes in plain Dutch; the W5.3 reply-draft generator injects it verbatim into
 * the prompt. NULL = generic Dutch neutral-professional baseline.
 *
 * Per-user (not per-org): each team member's drafts sound like that person, not a
 * homogenized house style. Persists across orgs — voice belongs to the person.
 */
export const Route = createFileRoute('/(app)/settings/writing-style')({
	loader: ({ context }) => context.queryClient.ensureQueryData(tonePlaybookQueryOptions),
	component: WritingStylePage
});

function WritingStylePage() {
	const { data } = useSuspenseQuery(tonePlaybookQueryOptions);
	const update = useUpdateTonePlaybook();
	const [text, setText] = useState(data.text ?? '');
	const [savedAt, setSavedAt] = useState<string | null>(data.text ? data.updatedAt : null);

	// If the server-side value changes while the page is mounted (e.g. a save from
	// another tab), surface it without clobbering the user's in-progress edits. We only
	// sync when the input is still in its "fresh-from-server" state.
	useEffect(() => {
		if (text === (data.text ?? '') || text.trim().length === 0) {
			// eslint-disable-next-line react-hooks/set-state-in-effect
			setText(data.text ?? '');

			setSavedAt(data.text ? data.updatedAt : null);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [data.text, data.updatedAt]);

	const dirty = text.trim() !== (data.text ?? '').trim();
	const trimmedLength = text.trim().length;

	const onSave = () => {
		update.mutate(
			{ text },
			{
				onSuccess: response => {
					setSavedAt(response.text ? response.updatedAt : null);
				}
			}
		);
	};

	const onClear = () => {
		setText('');
		update.mutate(
			{ text: '' },
			{
				onSuccess: () => {
					setSavedAt(null);
				}
			}
		);
	};

	return (
		<Container maxWidth='md' sx={{ py: 6 }}>
			<Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 1 }}>
				<Typography variant='h1' sx={{ fontSize: 28 }}>
					Mijn schrijfstijl
				</Typography>
				<BackToHomeButton />
			</Box>
			<Typography variant='body2' color='text.secondary' sx={{ mb: 3 }}>
				Vertel ons in een paar zinnen hoe je schrijft — begroeting, afsluiting, toon, vaste zinnetjes. Quoteom
				gebruikt dit voor concept-antwoorden op je offerteaanvragen, zodat ze klinken zoals jij. Leeg laten =
				een neutrale, professionele standaard.
			</Typography>

			<Paper variant='outlined' sx={{ p: 3, mb: 3 }}>
				<StandaloneField
					name='writingStyle'
					value={text}
					onChange={e => setText(e.target.value)}
					placeholder='Bijvoorbeeld: ik open met "Beste {voornaam},", houd het kort en concreet, sluit af met "Met vriendelijke groet, Marco" en mijn directe nummer. Geen overdreven beleefdheidsfrasen.'
					multiline
					minRows={6}
					maxRows={20}
					fullWidth
					maxLength={TONE_PLAYBOOK_MAX_LENGTH}
					disabled={update.isPending}
				/>
				<Stack
					direction='row'
					spacing={2}
					sx={{ mt: 2, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}
				>
					<Typography variant='caption' color='text.secondary'>
						{trimmedLength} / {TONE_PLAYBOOK_MAX_LENGTH} tekens
						{savedAt && ` · Laatst opgeslagen ${toReadableDateTime(savedAt)}`}
					</Typography>
					<Stack direction='row' spacing={1}>
						{data.text !== null && (
							<Button variant='text' color='inherit' onClick={onClear} disabled={update.isPending}>
								Wissen
							</Button>
						)}
						<Button
							variant='contained'
							onClick={onSave}
							disabled={update.isPending || !dirty || trimmedLength === 0}
							startIcon={update.isPending ? <CircularProgress size={14} /> : null}
						>
							{update.isPending ? 'Opslaan…' : 'Opslaan'}
						</Button>
					</Stack>
				</Stack>
				{update.isError && (
					<Alert severity='error' sx={{ mt: 2 }}>
						{update.error instanceof Error ? update.error.message : 'Opslaan mislukt'}
					</Alert>
				)}
			</Paper>

			<Typography variant='h2' sx={{ fontSize: 18, mb: 1 }}>
				Voorbeelden om je op weg te helpen
			</Typography>
			<Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
				Schrijf in je eigen woorden — dit zijn alleen aanknopingspunten. Je hoeft niets letterlijk over te
				nemen.
			</Typography>

			<ExampleAccordion
				title='Formeel · zakelijk'
				body={`Open met "Geachte heer/mevrouw {achternaam}," waar mogelijk, anders "Beste klant,". Toon: helder, beleefd, geen jargon, geen smileys. Antwoord in volledige zinnen.

Sluit af met:
Met vriendelijke groet,
{mijn naam}
{bedrijf}
{telefoon}`}
			/>
			<ExampleAccordion
				title='Casual · persoonlijk'
				body={`Open met "Hoi {voornaam}," of "Hallo {voornaam},". Toon: warm, direct, soms met een knipoog. Korte zinnen. Geen overdreven beleefdheidsfrasen.

Sluit af met:
Groet,
{mijn voornaam}
{telefoon}`}
			/>
			<ExampleAccordion
				title='Handwerker · praktisch'
				body={`Open met "Hoi {voornaam},". Toon: nuchter, concreet, technisch waar relevant. Noem altijd een richtbedrag of een afspraak voor opname binnen 24-48u.

Sluit af met:
Groet,
{mijn voornaam}
Mobiel: {telefoon}`}
			/>
		</Container>
	);
}

function ExampleAccordion({ title, body }: { title: string; body: string }) {
	return (
		<Accordion variant='outlined' disableGutters sx={{ mb: 1 }}>
			<AccordionSummary>
				<Typography variant='body2' sx={{ fontWeight: 500 }}>
					{title}
				</Typography>
			</AccordionSummary>
			<AccordionDetails>
				<Typography
					variant='body2'
					component='pre'
					sx={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', m: 0 }}
				>
					{body}
				</Typography>
			</AccordionDetails>
		</Accordion>
	);
}

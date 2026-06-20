import { Banner } from '@/components/Banner.component';
import { Field } from '@/components/Form/Field/Field.component';
import { Form } from '@/components/Form/Form.component';
import { PageHeader } from '@/components/PageHeader.component';
import { SectionError } from '@/components/SectionError.component';
import { BodySmall, H3 } from '@/components/Text.component';
import { tonePlaybookQueryOptions, useUpdateTonePlaybook } from '@/lib/queries/tone-playbook.queries';
import { WritingStyleSchema, type WritingStyleForm } from '@/lib/schemas/writing-style.schema';
import { toReadableDateTime } from '@/lib/utils/date.utils';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import { TONE_PLAYBOOK_MAX_LENGTH } from '@offertum/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import dedent from 'dedent';
import { useEffect, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';

/**
 * Per-user writing-style playbook editor . Free-form prose the user
 * writes in plain Dutch; the reply-draft generator injects it verbatim into
 * the prompt. NULL = generic Dutch neutral-professional baseline.
 * Per-user (not per-org): each team member's drafts sound like that person, not a
 * homogenized house style. Persists across orgs, voice belongs to the person.
 * Form composition: `<Form>` owns the `text` field via react-hook-form with a Zod
 * schema in `lib/schemas/writing-style.schema.ts`. Save flows through the form's
 * action; Wissen (clear) is a separate mutation that bypasses the form so it works
 * even when the textarea is already empty.
 */
export const Route = createFileRoute('/(app)/settings/writing-style')({
	loader: ({ context }) => context.queryClient.ensureQueryData(tonePlaybookQueryOptions),
	component: WritingStylePage,
	errorComponent: SectionError
});

function WritingStylePage() {
	const { data } = useSuspenseQuery(tonePlaybookQueryOptions);
	const update = useUpdateTonePlaybook();
	const [savedAt, setSavedAt] = useState<string | null>(data.text ? data.updatedAt : null);

	const onSubmit = ({ text }: WritingStyleForm) => {
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
		<Stack>
			<PageHeader
				title='Mijn schrijfstijl'
				caption='Vertel ons in een paar zinnen hoe je schrijft, begroeting, afsluiting, toon, vaste zinnetjes. Offertum gebruikt dit voor concept-antwoorden op je offerteaanvragen, zodat ze klinken zoals jij. Leeg laten = een neutrale, professionele standaard.'
			/>

			<Paper variant='outlined' sx={{ p: 3, mb: 3 }}>
				<Form<WritingStyleForm>
					action={onSubmit}
					schema={WritingStyleSchema}
					defaultValues={{ text: data.text ?? '' }}
					isDisabled={update.isPending}
				>
					<WritingStyleBody
						serverText={data.text}
						serverUpdatedAt={data.updatedAt}
						savedAt={savedAt}
						setSavedAt={setSavedAt}
						isSaving={update.isPending}
						error={update.error instanceof Error ? update.error : null}
						onClear={onClear}
					/>
				</Form>
			</Paper>

			<H3 sx={{ mb: 1 }}>Voorbeelden om je op weg te helpen</H3>
			<BodySmall color='text.secondary' sx={{ display: 'block', mb: 2 }}>
				Schrijf in je eigen woorden, dit zijn alleen aanknopingspunten. Je hoeft niets letterlijk over te nemen.
			</BodySmall>

			<ExampleAccordion
				title='Formeel · zakelijk'
				body={dedent`
					Open met "Geachte heer/mevrouw {achternaam}," waar mogelijk, anders "Beste klant,". Toon: helder, beleefd, geen jargon, geen smileys. Antwoord in volledige zinnen.

					Sluit af met:
					Met vriendelijke groet,
					{mijn naam}
					{bedrijf}
					{telefoon}
				`}
			/>
			<ExampleAccordion
				title='Casual · persoonlijk'
				body={dedent`
					Open met "Hoi {voornaam}," of "Hallo {voornaam},". Toon: warm, direct, soms met een knipoog. Korte zinnen. Geen overdreven beleefdheidsfrasen.

					Sluit af met:
					Groet,
					{mijn voornaam}
					{telefoon}
				`}
			/>
			<ExampleAccordion
				title='Handwerker · praktisch'
				body={dedent`
					Open met "Hoi {voornaam},". Toon: nuchter, concreet, technisch waar relevant. Noem altijd een richtbedrag of een afspraak voor opname binnen 24-48u.

					Sluit af met:
					Groet,
					{mijn voornaam}
					Mobiel: {telefoon}
				`}
			/>
		</Stack>
	);
}

interface WritingStyleBodyProps {
	serverText: string | null;
	serverUpdatedAt: string | null;
	savedAt: string | null;
	isSaving: boolean;
	error: Error | null;
	setSavedAt: (value: string | null) => void;
	onClear: () => void;
}

function WritingStyleBody({
	serverText,
	serverUpdatedAt,
	savedAt,
	isSaving,
	error,
	setSavedAt,
	onClear
}: WritingStyleBodyProps) {
	const { reset, formState } = useFormContext<WritingStyleForm>();
	const text = useWatch<WritingStyleForm, 'text'>({ name: 'text' }) ?? '';
	const trimmedLength = text.trim().length;
	const dirty = formState.isDirty;

	// External update (another tab saved): mirror back into the form state unless the
	// user has unsaved edits. Legitimate "external → local" pattern; setting via `reset`
	// keeps `isDirty` honest.
	useEffect(() => {
		const serverValue = serverText ?? '';
		if (text === serverValue || text.trim().length === 0) {
			reset({ text: serverValue });
			setSavedAt(serverText ? serverUpdatedAt : null);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [serverText, serverUpdatedAt]);

	return (
		<>
			<Field
				name='text'
				placeholder='Bijvoorbeeld: ik open met "Beste {voornaam},", houd het kort en concreet, sluit af met "Met vriendelijke groet, Marco" en mijn directe nummer. Geen overdreven beleefdheidsfrasen.'
				multiline
				minRows={6}
				maxRows={20}
				fullWidth
				maxLength={TONE_PLAYBOOK_MAX_LENGTH}
				disabled={isSaving}
			/>
			<Stack
				direction='row'
				useFlexGap
				spacing={2}
				sx={{ mt: 2, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}
			>
				<BodySmall color='text.secondary'>
					{trimmedLength} / {TONE_PLAYBOOK_MAX_LENGTH} tekens
					{savedAt && ` · Laatst opgeslagen ${toReadableDateTime(savedAt)}`}
				</BodySmall>
				<Stack direction='row' useFlexGap spacing={1}>
					{serverText !== null && (
						<Button variant='text' color='inherit' onClick={onClear} disabled={isSaving}>
							Wissen
						</Button>
					)}
					<Button
						type='submit'
						variant='contained'
						disabled={isSaving || !dirty || trimmedLength === 0}
						startIcon={isSaving ? <CircularProgress size={14} /> : null}
					>
						{isSaving ? 'Opslaan…' : 'Opslaan'}
					</Button>
				</Stack>
			</Stack>
			{error && (
				<Banner tone='error' sx={{ mt: 2 }}>
					{error.message || 'Opslaan mislukt'}
				</Banner>
			)}
		</>
	);
}

function ExampleAccordion({ title, body }: { title: string; body: string }) {
	return (
		<Accordion variant='outlined' disableGutters sx={{ mb: 1 }}>
			<AccordionSummary>
				<BodySmall fontWeight='medium'>{title}</BodySmall>
			</AccordionSummary>
			<AccordionDetails>
				<BodySmall component='pre' sx={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', m: 0 }}>
					{body}
				</BodySmall>
			</AccordionDetails>
		</Accordion>
	);
}

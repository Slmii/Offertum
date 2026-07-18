import { AppIcon } from '@/components/AppIcon.component';
import { Banner } from '@/components/Banner.component';
import { getByteLength, StandaloneField, trimToMaxBytes } from '@/components/Form/Field/Field.component';
import { PageHeader } from '@/components/PageHeader.component';
import { SectionError } from '@/components/SectionError.component';
import { BodySmall, H3, Label } from '@/components/Text.component';
import { useToast } from '@/lib/hooks/use-toast';
import { tonePlaybookQueryOptions, useUpdateTonePlaybook } from '@/lib/queries/tone-playbook.queries';
import { toReadableDateTime } from '@/lib/utils/date.utils';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Fade from '@mui/material/Fade';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import { TONE_PLAYBOOK_MAX_LENGTH } from '@offertum/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import dedent from 'dedent';
import { useEffect, useRef, useState } from 'react';

/**
 * Per-user writing-style playbook editor. Free-form prose the user writes in plain Dutch; the
 * reply-draft generator injects it verbatim into the prompt. NULL = generic Dutch neutral-
 * professional baseline. Per-user (not per-org): each team member's drafts sound like that person.
 *
 * Ported to the design's "Mijn schrijfstijl" layout: an editor card, a "Voorbeelden" accordion whose
 * rows fill the editor via "Gebruik als startpunt", and a tip card. The text is held in local state
 * (rather than react-hook-form) so the example rows can fill the textarea directly; validation is the
 * byte-accurate `maxLength` on the field plus the backend's own length guard.
 */
export const Route = createFileRoute('/(app)/settings/writing-style')({
	loader: ({ context }) => context.queryClient.ensureQueryData(tonePlaybookQueryOptions),
	component: WritingStylePage,
	errorComponent: SectionError
});

interface WritingStyleExample {
	id: string;
	label: string;
	body: string;
}

// The design's sample playbooks, surfaced verbatim in the Voorbeelden accordion; "Gebruik als
// startpunt" drops the chosen one into the editor.
const EXAMPLES: WritingStyleExample[] = [
	{
		id: 'formeel',
		label: 'Voorbeeld: formeel-zakelijk',
		body: dedent`
			Ik schrijf in beleefde, zakelijke toon. Ik begin altijd met "Geachte heer/mevrouw {achternaam}," en sluit af met "Met vriendelijke groet, John Doe — Doe Installatie B.V." gevolgd door mijn directe telefoonnummer.

			Bij opmaak van offertes noem ik altijd: (1) de gevraagde werkzaamheden, (2) een richtprijs inclusief BTW, (3) de eerstvolgende beschikbare opnamedatum, (4) een verwijzing naar mijn algemene voorwaarden.

			Ik vermijd verkleinwoorden en houd zinnen kort.
		`
	},
	{
		id: 'casual',
		label: 'Voorbeeld: casual',
		body: dedent`
			Ik schrijf zoals ik praat. "Hoi {voornaam}," om te beginnen, gewoon "Groet, John" om af te sluiten. Korte zinnen, geen poespas.

			Als iemand iets technisch vraagt leg ik 'm uit alsof ik 'm in 30 seconden in de keuken zou uitleggen. Geen jargon zonder context. Geen lange offertes — alleen het bedrag, de datum, en wat ik nodig heb van de klant.

			Bij spoed gebruik ik concrete tijden: "ik kan morgenmiddag 14:00", niet "ik kan zo snel mogelijk".
		`
	},
	{
		id: 'handwerker',
		label: 'Voorbeeld: handwerker',
		body: dedent`
			Eerlijk en direct. Geen marketing-praat. Ik zeg duidelijk wat het kost, hoe lang het duurt, en wat ik nodig heb (toegang, water af, parkeerplek).

			Bij twijfel over kosten geef ik een minimum-en-maximum bandbreedte met de zin "exacte prijs hangt af van wat we ter plekke aantreffen".

			Ik schrijf nooit "wij" — altijd "ik" (ook al heb ik soms een hulp). Dat voelt eerlijker.
		`
	}
];

function WritingStylePage() {
	const { data } = useSuspenseQuery(tonePlaybookQueryOptions);
	const update = useUpdateTonePlaybook();

	const serverText = data.text ?? '';
	const [text, setText] = useState(serverText);
	const [savedAt, setSavedAt] = useState<string | null>(data.text ? data.updatedAt : null);
	const [expanded, setExpanded] = useState<string | null>(null);

	// External update (another tab saved): adopt the new server value ONLY when the user hasn't
	// diverged from the previously-seen server value (i.e. has no unsaved local edits). The ref
	// tracks the last server text so we can tell "not dirty" from "actively editing".
	const lastServerText = useRef(serverText);
	useEffect(() => {
		const wasDirty = text !== lastServerText.current;
		lastServerText.current = serverText;
		if (!wasDirty) {
			setText(serverText);
			setSavedAt(data.text ? data.updatedAt : null);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [serverText, data.updatedAt]);

	const trimmedLength = text.trim().length;
	const isDirty = text !== serverText;
	const isOverMaxLength = getByteLength(text) > TONE_PLAYBOOK_MAX_LENGTH;

	const toast = useToast();

	const handleSave = () => {
		update.mutate(
			{ text },
			{
				onSuccess: response => setSavedAt(response.text ? response.updatedAt : null),
				onError: error =>
					toast.error('Opslaan mislukt', error instanceof Error ? error.message : 'Probeer het opnieuw.')
			}
		);
	};

	const handleClear = () => {
		update.mutate(
			{ text: '' },
			{
				onSuccess: () => {
					setText('');
					setSavedAt(null);
				},
				onError: error =>
					toast.error('Opslaan mislukt', error instanceof Error ? error.message : 'Probeer het opnieuw.')
			}
		);
	};

	return (
		<Stack>
			<PageHeader
				title='Mijn schrijfstijl'
				caption='Vertel ons in een paar zinnen hoe je schrijft, begroeting, afsluiting, toon, vaste zinnetjes. Offertum gebruikt dit voor concept-antwoorden op je offerteaanvragen, zodat ze klinken zoals jij. Leeg laten = een neutrale, professionele standaard.'
			/>

			<Stack useFlexGap spacing={3}>
				<Banner tone='info' title='Tip: schrijf in de eerste persoon'>
					Offertum gebruikt dit als instructie. Hoe specifieker je voorbeelden, hoe dichter het concept bij
					jouw eigen stijl uitkomt.
				</Banner>

				{/* Editor card */}
				<Paper variant='outlined' sx={{ p: 3 }}>
					<Label sx={{ display: 'block', mb: 1 }}>Jouw schrijfstijl</Label>
					<StandaloneField
						name='writing-style'
						value={text}
						onChange={event => setText(event.target.value)}
						placeholder='Bijvoorbeeld: ik open met "Beste {voornaam},", houd het kort en concreet, sluit af met "Met vriendelijke groet, John Doe" en mijn directe nummer. Geen overdreven beleefdheidsfrasen.'
						multiline
						minRows={8}
						maxRows={20}
						fullWidth
						maxLength={TONE_PLAYBOOK_MAX_LENGTH}
						disabled={update.isPending}
					/>

					<Stack
						direction='row'
						useFlexGap
						spacing={2}
						sx={{ mt: 2, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}
					>
						<BodySmall color='textSecondary'>
							{savedAt ? `Laatst opgeslagen ${toReadableDateTime(savedAt)}` : 'Nog niet opgeslagen'}
						</BodySmall>
						<Stack direction='row' useFlexGap spacing={1}>
							{serverText !== '' && (
								<Button
									variant='text'
									color='inherit'
									onClick={handleClear}
									disabled={update.isPending}
								>
									Wissen
								</Button>
							)}
							<Button
								variant='contained'
								onClick={handleSave}
								disabled={update.isPending || !isDirty || trimmedLength === 0 || isOverMaxLength}
								startIcon={
									update.isPending ? (
										<CircularProgress size={14} />
									) : (
										<AppIcon name='check' size='small' />
									)
								}
							>
								{update.isPending ? 'Opslaan…' : 'Opslaan'}
							</Button>
						</Stack>
					</Stack>
				</Paper>

				{/* Voorbeelden — MUI accordions inside a card, styled to the design: a header + dividered
				    flat rows with the chevron on the LEFT. Each row fills the editor via "Gebruik als
				    startpunt" (rendered as a span-button so it doesn't nest inside the summary's button). */}
				<Paper variant='outlined' sx={{ p: 0, overflow: 'hidden' }}>
					<Box sx={{ py: 2, px: 3, borderBottom: theme => `1px solid ${theme.tokens.color.line}` }}>
						{/* Matches the design's `.qm-panel-title` — Playfair 16px/500, deliberately smaller than H3. */}
						<H3 component='h2' fontWeight='medium' sx={{ fontSize: 16 }}>
							Voorbeelden
						</H3>
						<BodySmall color='textSecondary' sx={{ display: 'block', mt: 0.5, fontSize: 12 }}>
							Klik op een voorbeeld om &apos;m te bekijken. Je kunt &apos;m overnemen als startpunt en
							aanpassen.
						</BodySmall>
					</Box>
					{EXAMPLES.map(example => {
						const open = expanded === example.id;
						return (
							<Accordion
								key={example.id}
								disableGutters
								square
								elevation={0}
								expanded={open}
								onChange={(_event, isOpen) => setExpanded(isOpen ? example.id : null)}
								// The theme's DS accordion styles the summary/details via NESTED selectors on the
								// root (specificity 0,2,0), so component-level `sx` on <AccordionSummary>/<Details>
								// (0,1,0) loses. All overrides therefore live here, matching that specificity, to
								// flatten each accordion into a plain row inside the parent card.
								sx={theme => ({
									border: 'none',
									borderRadius: 0,
									boxShadow: 'none',
									backgroundColor: 'transparent',
									borderTop: `1px solid ${theme.tokens.color.line}`,
									'&:first-of-type': { borderTop: 'none' },
									'&::before': { display: 'none' },
									'&.Mui-expanded': { margin: 0 },
									'& .MuiAccordionSummary-root': {
										padding: theme.spacing(0, 3),
										minHeight: 0,
										backgroundColor: 'transparent',
										// Chevron on the left; keep our own right→down glyph (cancel MUI's 180° flip).
										flexDirection: 'row-reverse',
										gap: theme.spacing(1.25),
										'&:hover': { backgroundColor: theme.tokens.color.paper2 },
										'&.Mui-focusVisible': { backgroundColor: 'transparent' }
									},
									'& .MuiAccordionSummary-expandIconWrapper': {
										color: theme.tokens.color.ink3,
										transform: 'none'
									},
									'& .MuiAccordionSummary-expandIconWrapper.Mui-expanded': { transform: 'none' },
									'& .MuiAccordionSummary-content': {
										margin: theme.spacing(1.5, 0),
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'space-between',
										flexWrap: 'nowrap',
										gap: theme.spacing(1),
										fontSize: 14,
										fontWeight: 'medium',
										color: theme.tokens.color.ink2
									},
									'& .MuiAccordionDetails-root': {
										padding: theme.spacing(0, 3, 2, 7),
										borderTop: 'none'
									}
								})}
							>
								<AccordionSummary
									expandIcon={<AppIcon name={open ? 'chevron-down' : 'chevron-right'} size='small' />}
								>
									<Box component='span' sx={{ minWidth: 0 }}>
										{example.label}
									</Box>
									<Fade in={open}>
										<Button
											component='span'
											size='small'
											variant='contained'
											onClick={event => {
												event.stopPropagation();
												setText(trimToMaxBytes(example.body, TONE_PLAYBOOK_MAX_LENGTH));
												setExpanded(null);
											}}
										>
											Gebruik als startpunt
										</Button>
									</Fade>
								</AccordionSummary>
								<AccordionDetails sx={{ mt: 1 }}>
									<BodySmall
										component='pre'
										color='textSecondary'
										sx={{
											m: 0,
											whiteSpace: 'pre-wrap',
											fontFamily: 'inherit',
											lineHeight: 1.55
										}}
									>
										{example.body}
									</BodySmall>
								</AccordionDetails>
							</Accordion>
						);
					})}
				</Paper>
			</Stack>
		</Stack>
	);
}

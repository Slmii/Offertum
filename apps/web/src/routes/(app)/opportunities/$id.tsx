import { BackToHomeButton } from '@/components/BackToHomeButton.component';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import {
	opportunityDetailQueryOptions,
	useRegenerateReplyDraft,
	useUpdateOpportunityStatus,
	useUpdateReplyDraft
} from '@/lib/queries/opportunities.queries';
import { myMembershipQueryOptions } from '@/lib/queries/team.queries';
import { toReadableDate, toReadableDateTime, toReadableTimestamp } from '@/lib/utils/date.utils';
import {
	OPPORTUNITY_STATUS_CHIP_COLORS,
	OPPORTUNITY_STATUS_LABELS_NL,
	OPPORTUNITY_URGENCY_COLORS,
	opportunityCustomerLabel
} from '@/lib/utils/opportunity.utils';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { OPPORTUNITY_STATUSES, REPLY_DRAFT_BODY_MAX_LENGTH, type OpportunityStatus } from '@quoteom/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';

const AUTOSAVE_DEBOUNCE_MS = 1000;

/**
 * W5.4 — Opportunity detail view + AI reply-draft editor. Side panel renders the
 * extracted fields + original email body; main panel is a textarea pre-loaded with the
 * W5.3-generated draft. Edits autosave on a 1s debounce so the user never loses work +
 * the W14.10 `wasEditedByUser` flag flips correctly the first time the body diverges.
 *
 * Just-in-time banner: when `myMembership.user.hasTonePlaybook === false`, an Alert at
 * the top of the editor invites the user to write their writing-style playbook. Per
 * D31, this is the moment the user actually feels the benefit of authoring one.
 */
export const Route = createFileRoute('/(app)/opportunities/$id')({
	loader: async ({ context, params }) => {
		await Promise.all([
			context.queryClient.ensureQueryData(opportunityDetailQueryOptions(params.id)),
			context.queryClient.ensureQueryData(myMembershipQueryOptions)
		]);
	},
	component: OpportunityDetailPage
});

function OpportunityDetailPage() {
	const { id } = Route.useParams();
	const { data: opportunity } = useSuspenseQuery(opportunityDetailQueryOptions(id));
	const { data: me } = useSuspenseQuery(myMembershipQueryOptions);
	const updateStatus = useUpdateOpportunityStatus();
	const updateDraft = useUpdateReplyDraft(id);
	const regenerateDraft = useRegenerateReplyDraft(id);

	const replyDraft = opportunity.replyDraft;
	const [body, setBody] = useState(replyDraft?.body ?? '');
	const debouncedBody = useDebouncedValue(body, AUTOSAVE_DEBOUNCE_MS);
	// Track the last body we PUT to the server so we don't refire the mutation on
	// no-op debounce ticks (e.g. user types then immediately deletes back to the same
	// text). Initialised to the server-side value so the first autosave only fires
	// after the user types something new.
	const lastSavedRef = useRef<string>(replyDraft?.body ?? '');

	useEffect(() => {
		// Server-side draft arrived later (W5.3 was still generating when the page
		// loaded). Hydrate the editor with it; the lastSavedRef sync prevents the
		// hydration from looking like a user edit. This IS a legitimate "external →
		// local state" mirror (the buffered-input pattern from CLAUDE.md #12), so the
		// `set-state-in-effect` disable is intentional.
		if (replyDraft && body === '' && replyDraft.body !== '') {
			// eslint-disable-next-line react-hooks/set-state-in-effect
			setBody(replyDraft.body);
			lastSavedRef.current = replyDraft.body;
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [replyDraft?.id]);

	useEffect(() => {
		if (!replyDraft) {
			return;
		}
		if (debouncedBody === lastSavedRef.current) {
			return;
		}
		lastSavedRef.current = debouncedBody;
		updateDraft.mutate({ body: debouncedBody });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [debouncedBody]);

	const status = opportunity.status;
	const chip = OPPORTUNITY_STATUS_CHIP_COLORS[status];

	return (
		<Container maxWidth='lg' sx={{ py: 6 }}>
			<Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 1 }}>
				<Stack direction='row' spacing={2} sx={{ alignItems: 'baseline' }}>
					<MuiBackToList />
					<Typography variant='h1' sx={{ fontSize: 24 }}>
						{opportunityCustomerLabel(opportunity)} · {opportunity.requestType}
					</Typography>
				</Stack>
				<BackToHomeButton />
			</Box>
			<Stack direction='row' spacing={1} sx={{ alignItems: 'center', mb: 3, flexWrap: 'wrap' }}>
				<Box
					sx={{
						width: 10,
						height: 10,
						borderRadius: '50%',
						backgroundColor: OPPORTUNITY_URGENCY_COLORS[opportunity.urgency],
						flexShrink: 0
					}}
					aria-label={`Urgentie: ${opportunity.urgency}`}
				/>
				<Select
					size='small'
					value={status}
					onChange={e =>
						updateStatus.mutate({ id: opportunity.id, status: e.target.value as OpportunityStatus })
					}
					disabled={updateStatus.isPending}
					variant='standard'
					disableUnderline
					sx={{
						'& .MuiSelect-select': {
							backgroundColor: chip.bg,
							color: chip.fg,
							fontWeight: 500,
							fontSize: '0.7rem',
							padding: '2px 22px 2px 8px',
							borderRadius: '999px',
							minWidth: 0
						}
					}}
					renderValue={() => OPPORTUNITY_STATUS_LABELS_NL[status]}
				>
					{OPPORTUNITY_STATUSES.map(s => (
						<MenuItem key={s} value={s}>
							{OPPORTUNITY_STATUS_LABELS_NL[s]}
						</MenuItem>
					))}
				</Select>
				<Typography variant='caption' color='text.secondary'>
					Binnengekomen {toReadableTimestamp(opportunity.internalDate)}
				</Typography>
			</Stack>

			{me.user.hasTonePlaybook === false && (
				<Alert
					severity='info'
					sx={{ mb: 3 }}
					action={
						<Button color='inherit' size='small' component={Link} to='/settings/writing-style'>
							Schrijfstijl instellen
						</Button>
					}
				>
					Vertel ons in een paar zinnen hoe je schrijft — dan klinken concept-antwoorden zoals jou. Nu
					gebruiken we een neutrale standaardtoon.
				</Alert>
			)}

			{shouldShowRegenerateHint({ me, replyDraft }) && (
				<Alert
					severity='info'
					sx={{ mb: 3 }}
					action={
						<Button
							color='inherit'
							size='small'
							onClick={() =>
								regenerateDraft.mutate(undefined, {
									onSuccess: next => {
										setBody(next.body);
										lastSavedRef.current = next.body;
									}
								})
							}
							disabled={regenerateDraft.isPending}
							startIcon={regenerateDraft.isPending ? <CircularProgress size={14} /> : null}
						>
							{regenerateDraft.isPending ? 'Bezig…' : 'Regenereer in mijn stijl'}
						</Button>
					}
				>
					Je schrijfstijl is bijgewerkt sinds dit concept werd opgesteld. Wil je het concept opnieuw laten
					genereren in je nieuwe stijl?
				</Alert>
			)}

			<Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
				<Box sx={{ flex: 1, minWidth: 0 }}>
					<Stack
						direction='row'
						spacing={1}
						sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}
					>
						<Typography variant='h2' sx={{ fontSize: 18 }}>
							Concept-antwoord
						</Typography>
						{replyDraft && replyDraft.status !== 'sent' && me.user.hasTonePlaybook && (
							<Button
								size='small'
								variant='text'
								onClick={() =>
									regenerateDraft.mutate(undefined, {
										onSuccess: next => {
											setBody(next.body);
											lastSavedRef.current = next.body;
										}
									})
								}
								disabled={regenerateDraft.isPending}
								startIcon={regenerateDraft.isPending ? <CircularProgress size={14} /> : null}
							>
								{regenerateDraft.isPending ? 'Bezig…' : 'Regenereer in mijn stijl'}
							</Button>
						)}
					</Stack>
					{regenerateDraft.isError && (
						<Alert severity='error' sx={{ mb: 1 }}>
							Regenereren mislukt:{' '}
							{regenerateDraft.error instanceof Error ? regenerateDraft.error.message : 'Onbekende fout'}
						</Alert>
					)}
					{replyDraft ? (
						<DraftEditor
							body={body}
							setBody={setBody}
							isSaving={updateDraft.isPending}
							lastUpdatedIso={replyDraft.updatedAt}
							error={updateDraft.error}
						/>
					) : (
						<Paper variant='outlined' sx={{ p: 4, textAlign: 'center', borderStyle: 'dashed' }}>
							<CircularProgress size={20} sx={{ mb: 1 }} />
							<Typography variant='body2' color='text.secondary'>
								Concept-antwoord wordt opgesteld… Dit duurt meestal een paar seconden. Ververs de pagina
								als het langer duurt dan een minuut.
							</Typography>
						</Paper>
					)}
				</Box>
				<Box sx={{ flex: 1, minWidth: 0 }}>
					<Typography variant='h2' sx={{ fontSize: 18, mb: 1 }}>
						Originele e-mail
					</Typography>
					<OriginalEmailPanel
						subject={opportunity.subject}
						fromName={opportunity.fromName}
						fromEmail={opportunity.fromEmail}
						body={opportunity.originalEmailBody}
					/>

					<Typography variant='h2' sx={{ fontSize: 18, mt: 4, mb: 1 }}>
						Geëxtraheerde gegevens
					</Typography>
					<ExtractedFieldsPanel
						customerName={opportunity.customerName}
						customerEmail={opportunity.customerEmail}
						address={opportunity.address}
						requestType={opportunity.requestType}
						urgency={opportunity.urgency}
						customerDeadline={opportunity.customerDeadline}
						customerAppointment={opportunity.customerAppointment}
						deliverableHints={opportunity.deliverableHints}
					/>
				</Box>
			</Stack>
		</Container>
	);
}

function MuiBackToList() {
	return (
		<Button size='small' variant='text' component={Link} to='/opportunities'>
			← Lijst
		</Button>
	);
}

/**
 * W5.4 — Banner trigger for the "your writing style was updated since this draft was
 * generated" hint. Four conditions must all hold:
 *   1. The user has authored a playbook (no playbook → no comparison to make).
 *   2. The playbook timestamp exists AND is after the draft's `createdAt`.
 *   3. The draft hasn't been touched (`wasEditedByUser === false`) — we don't want to
 *      offer a clobber of in-progress edits.
 *   4. The draft isn't `sent` (nothing to regenerate post-send).
 */
function shouldShowRegenerateHint({
	me,
	replyDraft
}: {
	me: { user: { hasTonePlaybook: boolean; tonePlaybookUpdatedAt: string | null } };
	replyDraft: { createdAt: string; wasEditedByUser: boolean; status: string } | null;
}): boolean {
	if (!replyDraft) {return false;}
	if (replyDraft.status === 'sent') {return false;}
	if (replyDraft.wasEditedByUser) {return false;}
	if (!me.user.hasTonePlaybook || !me.user.tonePlaybookUpdatedAt) {return false;}
	return new Date(me.user.tonePlaybookUpdatedAt).getTime() > new Date(replyDraft.createdAt).getTime();
}

function DraftEditor({
	body,
	setBody,
	isSaving,
	lastUpdatedIso,
	error
}: {
	body: string;
	setBody: (next: string) => void;
	isSaving: boolean;
	lastUpdatedIso: string;
	error: unknown;
}) {
	return (
		<Paper variant='outlined' sx={{ p: 2 }}>
			<TextField
				value={body}
				onChange={e => setBody(e.target.value)}
				placeholder='Concept-antwoord verschijnt hier zodra het is opgesteld.'
				multiline
				minRows={12}
				maxRows={30}
				fullWidth
				slotProps={{ htmlInput: { maxLength: REPLY_DRAFT_BODY_MAX_LENGTH } }}
			/>
			<Stack
				direction='row'
				spacing={1}
				sx={{ mt: 1, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}
			>
				<Typography variant='caption' color='text.secondary'>
					{body.length} / {REPLY_DRAFT_BODY_MAX_LENGTH} tekens
				</Typography>
				<Typography
					variant='caption'
					color='text.secondary'
					sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
				>
					{isSaving ? (
						<>
							<CircularProgress size={10} /> Opslaan…
						</>
					) : (
						`Laatst gewijzigd ${toReadableDateTime(lastUpdatedIso)}`
					)}
				</Typography>
			</Stack>
			{error instanceof Error && (
				<Alert severity='error' sx={{ mt: 2 }}>
					Opslaan mislukt: {error.message}
				</Alert>
			)}
		</Paper>
	);
}

function OriginalEmailPanel({
	subject,
	fromName,
	fromEmail,
	body
}: {
	subject: string | null;
	fromName: string | null;
	fromEmail: string | null;
	body: string;
}) {
	return (
		<Paper variant='outlined' sx={{ p: 2 }}>
			{subject && (
				<Typography variant='body2' sx={{ fontWeight: 500, mb: 0.5 }}>
					{subject}
				</Typography>
			)}
			<Typography variant='caption' color='text.secondary' sx={{ display: 'block', mb: 1 }}>
				{fromName ?? 'Onbekend'} {fromEmail ? `<${fromEmail}>` : ''}
			</Typography>
			<Divider sx={{ mb: 1 }} />
			<Typography
				variant='body2'
				component='pre'
				sx={{
					whiteSpace: 'pre-wrap',
					fontFamily: 'inherit',
					m: 0,
					maxHeight: 360,
					overflowY: 'auto'
				}}
			>
				{body || '(geen tekstuele inhoud)'}
			</Typography>
		</Paper>
	);
}

function ExtractedFieldsPanel({
	customerName,
	customerEmail,
	address,
	requestType,
	urgency,
	customerDeadline,
	customerAppointment,
	deliverableHints
}: {
	customerName: string | null;
	customerEmail: string | null;
	address: string | null;
	requestType: string;
	urgency: 'emergency' | 'high' | 'normal' | 'low';
	customerDeadline: string | null;
	customerAppointment: string | null;
	deliverableHints: string[];
}) {
	return (
		<Paper variant='outlined' sx={{ p: 2 }}>
			<Stack spacing={1.5}>
				<ExtractedField label='Klant' value={customerName} />
				<ExtractedField label='E-mail' value={customerEmail} />
				<ExtractedField label='Adres' value={address} />
				<ExtractedField label='Aanvraag' value={requestType} />
				<ExtractedField label='Urgentie' value={urgency} />
				<ExtractedField label='Deadline' value={customerDeadline ? toReadableDate(customerDeadline) : null} />
				<ExtractedField
					label='Afspraak'
					value={customerAppointment ? toReadableDate(customerAppointment) : null}
				/>
				<Box>
					<Typography variant='caption' color='text.secondary'>
						Onderdelen
					</Typography>
					{deliverableHints.length === 0 ? (
						<Typography variant='body2'>—</Typography>
					) : (
						<Stack direction='row' spacing={0.5} sx={{ flexWrap: 'wrap', mt: 0.5 }}>
							{deliverableHints.map(hint => (
								<Chip key={hint} size='small' label={hint} />
							))}
						</Stack>
					)}
				</Box>
			</Stack>
		</Paper>
	);
}

function ExtractedField({ label, value }: { label: string; value: string | null }) {
	return (
		<Box>
			<Typography variant='caption' color='text.secondary'>
				{label}
			</Typography>
			<Typography variant='body2'>{value ?? '—'}</Typography>
		</Box>
	);
}

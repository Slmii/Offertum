import { AppIcon } from '@/components/AppIcon.component';
import { AvailabilityPicker, type CalendarProvider } from '@/components/AvailabilityPicker.component';
import { Banner } from '@/components/Banner.component';
import { ExpiryActionCard } from '@/components/ExpiryActionCard.component';
import { StandaloneDatePicker } from '@/components/Form/DatePicker/DatePicker.component';
import { StandaloneField } from '@/components/Form/Field/Field.component';
import { StandaloneSelect } from '@/components/Form/Select/Select.component';
import { PillSelect } from '@/components/PillSelect.component';
import { QuotePanel } from '@/components/QuotePanel.component';
import { QuotePdfAttachSelect } from '@/components/QuotePdfAttachSelect.component';
import { SectionError } from '@/components/SectionError.component';
import { SubscribeCta } from '@/components/SubscribeCta.component';
import { BodySmall, H1, H3, Label } from '@/components/Text.component';
import { LockGlyph } from '@/components/UpsellTeaser.component';
import { useToast } from '@/lib/hooks/use-toast';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { billingStatusQueryOptions, isBillingEntitled } from '@/lib/queries/billing.queries';
import { gmailStatusQueryOptions, microsoftStatusQueryOptions } from '@/lib/queries/email.queries';
import { opportunityExpiryActionQueryOptions } from '@/lib/queries/expiry.queries';
import {
	opportunityDetailQueryOptions,
	useAssignOpportunity,
	useComposeFollowupReplyDraft,
	useDeleteReplyDraftAttachment,
	useRegenerateReplyDraft,
	useSendReplyDraft,
	useUpdateOpportunityFields,
	useUpdateOpportunityStatus,
	useUpdateReplyDraft,
	useUploadReplyDraftAttachment
} from '@/lib/queries/opportunities.queries';
import { quoteDraftsQueryOptions } from '@/lib/queries/quote-drafts.queries';
import { membershipsQueryOptions, myMembershipQueryOptions } from '@/lib/queries/team.queries';
import { toReadableDate, toReadableDateTime, toReadableTimestamp } from '@/lib/utils/date.utils';
import { toReadableBytes } from '@/lib/utils/number.utils';
import {
	getStatusOptionsForCurrent,
	OPPORTUNITY_STATUS_LABELS_NL,
	OPPORTUNITY_STATUS_PILL_TONES,
	OPPORTUNITY_URGENCY_COLORS,
	OPPORTUNITY_URGENCY_LABELS_NL,
	opportunityCustomerLabel
} from '@/lib/utils/opportunity.utils';
import { isReplyDraftEditable } from '@/lib/utils/reply-draft-editability';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import {
	OPPORTUNITY_URGENCIES,
	REPLY_DRAFT_BODY_MAX_LENGTH,
	type CustomerReplyEntry,
	type OpportunityFieldChange,
	type OpportunityTimelineEvent,
	type OpportunityUrgency,
	type ReplyDraft,
	type ReplyDraftAttachment
} from '@offertum/shared';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useRef, useState } from 'react';

const AUTOSAVE_DEBOUNCE_MS = 1000;

/**
 * Opportunity detail view + AI reply-draft editor. Side panel renders the
 * extracted fields + original email body; main panel is a textarea pre-loaded with the
 * -generated draft. Edits autosave on a 1s debounce so the user never loses work +
 * the `wasEditedByUser` flag flips correctly the first time the body diverges.
 * Just-in-time banner: when `myMembership.user.hasTonePlaybook === false`, an Alert at
 * the top of the editor invites the user to write their writing-style playbook. Per
 *  this is the moment the user actually feels the benefit of authoring one.
 */
export const Route = createFileRoute('/(app)/opportunities/$id')({
	loader: ({ context, params }) =>
		// All prefetches run in parallel — nothing is awaited serially in front. Billing is
		// no longer a gate here: the expiry-action endpoint already returns `null` for
		// non-entitled orgs, so prefetching it unconditionally is cheap and removes a
		// blocking round-trip from every detail navigation.
		Promise.all([
			context.queryClient.ensureQueryData(opportunityDetailQueryOptions(params.id)),
			context.queryClient.ensureQueryData(billingStatusQueryOptions),
			context.queryClient.ensureQueryData(myMembershipQueryOptions),
			// Memberships drive the assignee picker — same load cycle as the detail
			// fetch so the picker renders instantly when the panel paints.
			context.queryClient.ensureQueryData(membershipsQueryOptions),
			// Persisted quote drafts for the W10.3 quote panel.
			context.queryClient.ensureQueryData(quoteDraftsQueryOptions(params.id)),
			// W13 — live smart-expiry suggestion (or null) for the action card.
			context.queryClient.ensureQueryData(opportunityExpiryActionQueryOptions(params.id))
		]),
	component: OpportunityDetailPage,
	errorComponent: SectionError
});

function OpportunityDetailPage() {
	const { id } = Route.useParams();
	const { data: opportunity } = useSuspenseQuery(opportunityDetailQueryOptions(id));
	const { data: me } = useSuspenseQuery(myMembershipQueryOptions);
	const { data: billing } = useSuspenseQuery(billingStatusQueryOptions);
	const isEntitled = isBillingEntitled(billing.state);
	const isOwner = me.role === 'OWNER';
	const updateStatus = useUpdateOpportunityStatus();
	const updateDraft = useUpdateReplyDraft(id);
	const regenerateDraft = useRegenerateReplyDraft(id);
	const sendDraft = useSendReplyDraft(id);
	const composeFollowup = useComposeFollowupReplyDraft(id);
	const uploadAttachment = useUploadReplyDraftAttachment(id);
	const deleteAttachment = useDeleteReplyDraftAttachment(id);
	const toast = useToast();
	const [sendConfirmOpen, setSendConfirmOpen] = useState(false);

	const replyDraft = opportunity.replyDraft;
	const status = opportunity.status;
	// editability collapses to draft-state only. Opp.status no longer
	// gates the editor; courtesy follow-ups on a WON/LOST deal stay editable until
	// they're sent. `null` draftStatus means "no draft generated yet" → editable
	// (caller decides); the detail page only renders the editor once a draft exists.
	const isDraftEditable = isReplyDraftEditable(replyDraft?.status);
	const [body, setBody] = useState(replyDraft?.body ?? '');
	const debouncedBody = useDebouncedValue(body, AUTOSAVE_DEBOUNCE_MS);
	// Track the last body we PUT to the server so we don't refire the mutation on
	// no-op debounce ticks (e.g. user types then immediately deletes back to the same
	// text). Initialised to the server-side value so the first autosave only fires
	// after the user types something new.
	const lastSavedRef = useRef<string>(replyDraft?.body ?? '');
	// The draft id the editor's local state currently belongs to. When a NEW draft
	// arrives (compose-followup, customer-reply regeneration), the editor must swap to
	// its body — the old `body === ''` guard alone never replaced displayed text, so the
	// first keystroke autosaved the STALE old text over the fresh AI draft.
	const editorDraftIdRef = useRef<string | null>(replyDraft?.id ?? null);

	useEffect(() => {
		if (!replyDraft) {
			return;
		}
		const isNewDraft = replyDraft.id !== editorDraftIdRef.current;
		// Late hydration: same draft id but the editor started empty ( was still
		// generating when the page loaded). The lastSavedRef sync prevents the adopt
		// from looking like a user edit. This IS a legitimate "external → local state"
		// mirror (the buffered-input pattern from CLAUDE.md #12), so the
		// `set-state-in-effect` disable is intentional.
		if (isNewDraft || (body === '' && replyDraft.body !== '')) {
			editorDraftIdRef.current = replyDraft.id;
			setBody(replyDraft.body);
			lastSavedRef.current = replyDraft.body;
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [replyDraft?.id]);

	useEffect(() => {
		if (!replyDraft) {
			return;
		}
		if (debouncedBody !== body) {
			// A lagging debounce tick from BEFORE a draft swap — saving it would write
			// the pre-swap text onto the newly adopted draft.
			return;
		}
		if (debouncedBody === lastSavedRef.current) {
			return;
		}
		if (!isDraftEditable) {
			// Skip autosave on locked drafts — the backend would 409 with REPLY_DRAFT_LOCKED
			// and the UI would render a confusing error toast. The body state can still
			// diverge from the server's copy if the user typed before the lock applied;
			// that's fine — when the lock lifts (status revert to `waiting`), the next
			// debounce tick flushes the buffered edits.
			return;
		}
		lastSavedRef.current = debouncedBody;
		updateDraft.mutate({ body: debouncedBody });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [debouncedBody, isDraftEditable]);

	return (
		<Stack>
			<Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 1 }}>
				<Stack direction='row' useFlexGap spacing={2} sx={{ alignItems: 'baseline' }}>
					<MuiBackToList />
					<H1 sx={{ fontSize: 24 }}>
						{opportunityCustomerLabel(opportunity)} · {opportunity.requestType}
					</H1>
				</Stack>
			</Box>
			<Stack direction='row' useFlexGap spacing={1} sx={{ alignItems: 'center', mb: 3, flexWrap: 'wrap' }}>
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
				<PillSelect
					value={status}
					ariaLabel='Status wijzigen'
					disabled={updateStatus.isPending}
					onChange={next =>
						updateStatus.mutate(
							{ id: opportunity.id, status: next },
							{
								onSuccess: () => toast.success('Opgeslagen', 'Status bijgewerkt.'),
								onError: err =>
									toast.error(
										'Bijwerken mislukt',
										err instanceof Error ? err.message : 'Probeer het opnieuw.'
									)
							}
						)
					}
					options={getStatusOptionsForCurrent(status).map(s => ({
						id: s,
						label: OPPORTUNITY_STATUS_LABELS_NL[s],
						tone: OPPORTUNITY_STATUS_PILL_TONES[s]
					}))}
				/>
				<BodySmall color='text.secondary'>
					Binnengekomen {toReadableTimestamp(opportunity.internalDate)}
				</BodySmall>
			</Stack>

			{isEntitled && <ExpiryActionCard opportunityId={id} isOwner={isOwner} />}

			{me.user.hasTonePlaybook === false && (
				<Banner
					tone='info'
					sx={{ mb: 3 }}
					action={
						<Button color='inherit' size='small' component={Link} to='/settings/writing-style'>
							Schrijfstijl instellen
						</Button>
					}
				>
					Vertel ons in een paar zinnen hoe je schrijft, dan klinken concept-antwoorden zoals jou. Nu
					gebruiken we een neutrale standaardtoon.
				</Banner>
			)}

			{isDraftEditable && shouldShowRegenerateHint({ me, replyDraft }) && (
				<Banner
					tone='info'
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
				</Banner>
			)}

			<Stack direction={{ xs: 'column', md: 'row' }} useFlexGap spacing={3}>
				<Box sx={{ flex: 1, minWidth: 0 }}>
					<Stack
						direction='row'
						useFlexGap
						spacing={1}
						sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}
					>
						<Stack
							direction='row'
							useFlexGap
							spacing={1}
							sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}
						>
							<H3>Concept-antwoord</H3>
							{replyDraft?.kind === 'check_in' && (
								<Chip size='small' label='Automatische follow-up' color='info' variant='outlined' />
							)}
						</Stack>
						{isEntitled && replyDraft && isDraftEditable && me.user.hasTonePlaybook && (
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
					{isEntitled ? (
						<>
							{regenerateDraft.isError && (
								<Banner tone='error' sx={{ mb: 1 }}>
									Regenereren mislukt:{' '}
									{regenerateDraft.error instanceof Error
										? regenerateDraft.error.message
										: 'Onbekende fout'}
								</Banner>
							)}
							{replyDraft ? (
								<>
									<DraftEditor
										body={body}
										setBody={setBody}
										isSaving={updateDraft.isPending}
										lastUpdatedIso={replyDraft.updatedAt}
										error={updateDraft.error}
										readOnly={!isDraftEditable}
									/>
									<AttachmentsPanel
										opportunityId={id}
										attachments={replyDraft.attachments}
										readOnly={!isDraftEditable}
										isUploading={uploadAttachment.isPending}
										uploadError={uploadAttachment.error}
										onUpload={file => uploadAttachment.mutate({ file })}
										deletingId={
											deleteAttachment.isPending
												? (deleteAttachment.variables?.attachmentId ?? null)
												: null
										}
										deleteError={deleteAttachment.error}
										onDelete={attachmentId => deleteAttachment.mutate({ attachmentId })}
									/>
									{replyDraft.status === 'sent' && replyDraft.sentAt ? (
										<Stack
											direction='row'
											useFlexGap
											spacing={1}
											sx={{ mt: 2, alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}
										>
											{/* "Concept-vervolg opstellen". Manual follow-up entry
											 * point for cases where the customer responded out-of-band
											 * (phone, in-person) but the owner still wants to send a
											 * written confirmation. The customer-driven path is handled
											 * automatically by the inbox-side thread reconstitution. */}
											<Button
												variant='contained'
												fullWidth
												size='large'
												onClick={() => composeFollowup.mutate()}
												disabled={composeFollowup.isPending}
												startIcon={
													composeFollowup.isPending ? <CircularProgress size={14} /> : null
												}
											>
												{composeFollowup.isPending ? 'Bezig…' : 'Concept-vervolg opstellen'}
											</Button>
										</Stack>
									) : (
										<Stack
											direction='row'
											useFlexGap
											spacing={1}
											sx={{ mt: 2, justifyContent: 'flex-end', flexWrap: 'wrap' }}
										>
											{sendDraft.isError && (
												<Banner tone='error' sx={{ flex: 1 }}>
													Versturen mislukt:{' '}
													{sendDraft.error instanceof Error
														? sendDraft.error.message
														: 'Onbekende fout'}
												</Banner>
											)}
											<Button
												variant='text'
												size='medium'
												onClick={() => setSendConfirmOpen(true)}
												disabled={
													sendDraft.isPending ||
													updateDraft.isPending ||
													regenerateDraft.isPending ||
													body.trim().length === 0
												}
												startIcon={sendDraft.isPending ? <CircularProgress size={14} /> : null}
											>
												{sendDraft.isPending ? 'Versturen…' : 'Verstuur'}
											</Button>
										</Stack>
									)}
								</>
							) : opportunity.dismissedAt ? (
								<Paper variant='outlined' sx={{ p: 4, textAlign: 'center', borderStyle: 'dashed' }}>
									<BodySmall color='text.secondary'>
										Deze offerteaanvraag is afgewezen: er wordt geen concept-antwoord opgesteld.
									</BodySmall>
								</Paper>
							) : (
								<Paper variant='outlined' sx={{ p: 4, textAlign: 'center', borderStyle: 'dashed' }}>
									<CircularProgress size={20} sx={{ mb: 1 }} />
									<BodySmall color='text.secondary'>
										Concept-antwoord wordt opgesteld… Dit duurt meestal een paar seconden. Ververs
										de pagina als het langer duurt dan een minuut.
									</BodySmall>
								</Paper>
							)}
						</>
					) : (
						<LockedReplyPanel isOwner={isOwner} />
					)}
					<QuotePanel opportunityId={id} />
					{(opportunity.replyDraftHistory.length > 0 ||
						opportunity.customerReplies.length > 0 ||
						opportunity.timeline.length > 0) && (
						<TimelinePanel
							opportunityId={id}
							drafts={opportunity.replyDraftHistory}
							customerReplies={opportunity.customerReplies}
							timeline={opportunity.timeline}
						/>
					)}
				</Box>
				<Box sx={{ flex: 1, minWidth: 0 }}>
					<H3 sx={{ mb: 1 }}>Originele e-mail</H3>
					<OriginalEmailPanel
						subject={opportunity.subject}
						fromName={opportunity.fromName}
						fromEmail={opportunity.fromEmail}
						body={opportunity.originalEmailBody}
					/>

					<H3 sx={{ mt: 4, mb: 1 }}>Geëxtraheerde gegevens</H3>
					<ExtractedFieldsPanel opportunityId={id} opportunity={opportunity} />
				</Box>
			</Stack>

			<SendConfirmDialog
				isOpen={sendConfirmOpen && replyDraft !== null}
				recipientName={opportunity.fromName}
				recipientEmail={opportunity.fromEmail}
				subject={opportunity.subject}
				bodyPreview={body}
				attachments={replyDraft?.attachments ?? []}
				isSending={sendDraft.isPending || updateDraft.isPending}
				onClose={() => setSendConfirmOpen(false)}
				onConfirm={async () => {
					// Flush un-debounced edits BEFORE sending — the 1s autosave may not have
					// fired yet, and the send endpoint reads the server-side body. Marking
					// lastSavedRef also neutralizes the pending debounce tick (it becomes a
					// no-op), so it can't fire after the send.
					if (isDraftEditable && body !== lastSavedRef.current) {
						try {
							await updateDraft.mutateAsync({ body });
							lastSavedRef.current = body;
						} catch {
							// Flush failed — abort the send so the customer never receives an
							// older body. The editor's existing error alert shows the failure.
							setSendConfirmOpen(false);
							return;
						}
					}
					sendDraft.mutate(undefined, {
						onSuccess: () => toast.success('Verzonden', 'Je antwoord is naar de klant gestuurd.'),
						onError: err =>
							toast.error(
								'Versturen mislukt',
								err instanceof Error ? err.message : 'Probeer het opnieuw.'
							),
						onSettled: () => setSendConfirmOpen(false)
					});
				}}
			/>
		</Stack>
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
 * Shown in the reply-draft area when the org has no active subscription.
 * Owners get a direct "Abonneren" CTA; non-owners see a muted ask-the-owner line.
 * Mirrors the LockGlyph + copy + CTA pattern from the UpsellTeaser.
 */
function LockedReplyPanel({ isOwner }: { isOwner: boolean }) {
	return (
		<Paper
			variant='outlined'
			sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 1.5, alignItems: 'flex-start' }}
		>
			<Stack direction='row' useFlexGap spacing={1} sx={{ alignItems: 'center' }}>
				<LockGlyph />
				<Label fontWeight='bold'>Abonneer om te versturen</Label>
			</Stack>
			<BodySmall color='text.secondary'>
				Abonneer om AI-antwoorden te versturen en deze aanvraag op te volgen.
			</BodySmall>
			<SubscribeCta isOwner={isOwner} />
		</Paper>
	);
}

/**
 * Banner trigger for the "your writing style was updated since this draft was
 * generated" hint. Conditions:
 *  1. The user has authored a playbook (no playbook → no comparison to make).
 *  2. The playbook timestamp exists AND is after the draft body's last AI generation
 *  (`aiBodyGeneratedAt`, sourced from `AICall.createdAt`). Falls back to the row's
 *  `createdAt` if the AICall join is null. Using the AI-generation timestamp
 *  (not the row's `createdAt`) is critical so the banner correctly disappears
 *  after a regenerate — the row's `createdAt` doesn't advance on `prisma.update`,
 *  so the AICall pointer is the only honest anchor for "what does this body
 *  reflect?".
 *  3. The draft isn't `sent` (nothing to regenerate post-send).
 * Deliberately NOT checking `wasEditedByUser` — the banner is an offer, not an
 * auto-action, and clicking is the user's explicit choice. Suppressing the banner on
 * edited drafts was over-cautious; users who've also updated their writing style
 * legitimately want the option to regenerate even after touching the draft.
 */
function shouldShowRegenerateHint({
	me,
	replyDraft
}: {
	me: { user: { hasTonePlaybook: boolean; tonePlaybookUpdatedAt: string | null } };
	replyDraft: { createdAt: string; aiBodyGeneratedAt: string | null; status: string } | null;
}): boolean {
	if (!replyDraft) {
		return false;
	}
	if (replyDraft.status === 'sent') {
		return false;
	}
	if (!me.user.hasTonePlaybook || !me.user.tonePlaybookUpdatedAt) {
		return false;
	}
	const bodyTimestamp = replyDraft.aiBodyGeneratedAt ?? replyDraft.createdAt;
	return new Date(me.user.tonePlaybookUpdatedAt).getTime() > new Date(bodyTimestamp).getTime();
}

function DraftEditor({
	body,
	setBody,
	isSaving,
	lastUpdatedIso,
	error,
	readOnly
}: {
	body: string;
	setBody: (next: string) => void;
	isSaving: boolean;
	lastUpdatedIso: string;
	error: unknown;
	readOnly: boolean;
}) {
	return (
		<Paper variant='outlined' sx={{ p: 2 }}>
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
				<BodySmall color='text.secondary'>
					{body.length} / {REPLY_DRAFT_BODY_MAX_LENGTH} tekens
				</BodySmall>
				<BodySmall color='text.secondary' sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
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
			{error instanceof Error && !readOnly && (
				<Banner tone='error' sx={{ mt: 2 }}>
					Opslaan mislukt: {error.message}
				</Banner>
			)}
		</Paper>
	);
}

function SendConfirmDialog({
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
		<Dialog open={isOpen} onClose={isSending ? undefined : onClose} maxWidth='sm' fullWidth>
			<DialogTitle>Concept versturen?</DialogTitle>
			<DialogContent>
				<BodySmall color='text.secondary' sx={{ mb: 2 }}>
					Dit verstuurt direct als antwoord op de oorspronkelijke e-mail. Je kunt het niet terugnemen.
				</BodySmall>
				<Box sx={{ mb: 2 }}>
					<BodySmall color='text.secondary'>Naar</BodySmall>
					<BodySmall>{recipientLabel}</BodySmall>
				</Box>
				{subject && (
					<Box sx={{ mb: 2 }}>
						<BodySmall color='text.secondary'>Onderwerp</BodySmall>
						<BodySmall>Re: {subject.replace(/^re:\s*/i, '')}</BodySmall>
					</Box>
				)}
				<Box>
					<BodySmall color='text.secondary'>Begin van het bericht</BodySmall>
					<BodySmall
						component='pre'
						sx={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', m: 0, mt: 0.5, color: 'text.primary' }}
					>
						{preview}
					</BodySmall>
				</Box>
				{attachments.length > 0 && (
					<Box sx={{ mt: 2 }}>
						<BodySmall color='text.secondary'>Bijlagen ({attachments.length})</BodySmall>
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
			</DialogContent>
			<DialogActions>
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
			</DialogActions>
		</Dialog>
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
				<BodySmall fontWeight='medium' sx={{ mb: 0.5 }}>
					{subject}
				</BodySmall>
			)}
			<BodySmall color='text.secondary' sx={{ mb: 1 }}>
				{fromName ?? 'Onbekend'} {fromEmail ? `<${fromEmail}>` : ''}
			</BodySmall>
			<Divider sx={{ mb: 1 }} />
			<BodySmall
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
			</BodySmall>
		</Paper>
	);
}

/**
 * Right-side panel showing the AI-extracted opportunity fields. Customer name / email /
 * request type / deliverable hints stay read-only (less owner-mutable signals); urgency /
 * address / deadline / appointment are inline-editable because the extractor isn't
 * always right and there's no other correction path. Edits commit on blur (text /
 * dates) or on change (select). No editability lock — even on WON/LOST opps the owner
 * may need to correct a typo'd address or fix a deadline post-hoc.
 */
function ExtractedFieldsPanel({
	opportunityId,
	opportunity
}: {
	opportunityId: string;
	opportunity: {
		customerName: string | null;
		customerEmail: string | null;
		address: string | null;
		requestType: string;
		urgency: OpportunityUrgency;
		customerDeadline: string | null;
		customerAppointment: string | null;
		deliverableHints: string[];
		assignedToUserId: string | null;
	};
}) {
	const updateFields = useUpdateOpportunityFields(opportunityId);
	const assign = useAssignOpportunity(opportunityId);
	const { data: memberships } = useSuspenseQuery(membershipsQueryOptions);

	// AvailabilityPicker — anchored popover for the "Afspraak" field. Connected providers
	// are read from the REAL mailbox status (on-demand, not route-critical — bare useQuery is
	// allowed for interaction-driven data per the route conventions). Busy windows are mocked
	// inside the picker; see AvailabilityPicker.mock.ts.
	const { data: gmailStatus } = useQuery(gmailStatusQueryOptions);
	const { data: microsoftStatus } = useQuery(microsoftStatusQueryOptions);
	const connectedProviders: CalendarProvider[] = [
		...(gmailStatus?.connected ? (['google'] as const) : []),
		...(microsoftStatus?.connected ? (['microsoft'] as const) : [])
	];
	const [appointmentAnchorEl, setAppointmentAnchorEl] = useState<HTMLElement | null>(null);

	// Sentinel string for the "Niemand" option — the underlying StandaloneSelect's
	// `renderValue` treats `''` as "nothing selected" and shows the placeholder, so we
	// can't bind null directly to the value prop. Decoded on commit + render.
	const ASSIGNEE_NONE = 'none';
	const commitAssignee = (next: string) => {
		const nextUserId = next === ASSIGNEE_NONE ? null : next;
		if (nextUserId === (opportunity.assignedToUserId ?? null)) {
			return;
		}
		assign.mutate({ userId: nextUserId });
	};

	// Local mirrors for the editable fields. Re-sync from server on prop change so
	// regenerate / mutation success picks up the canonical value. Text + dates commit
	// on blur (or change for dates); urgency commits on change.
	const [address, setAddress] = useState<string>(opportunity.address ?? '');

	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect
		setAddress(opportunity.address ?? '');
	}, [opportunity.address]);

	const commitAddress = () => {
		const next = address.trim() || null;
		if (next === (opportunity.address ?? null)) {
			return;
		}
		updateFields.mutate({ address: next });
	};

	// Deadlines are date-only ("klant wil voor X klaar"). Appointments include a time
	// component ("donderdag 10:00") so we send the full ISO datetime — server stores as
	// DateTime either way, the service-layer no-op check handles same-value writes.
	const commitDeadline = (next: Dayjs | null) => {
		const iso = next && next.isValid() ? next.format('YYYY-MM-DD') : null;
		const currentIso = opportunity.customerDeadline ? opportunity.customerDeadline.slice(0, 10) : null;
		if (iso === currentIso) {
			return;
		}
		updateFields.mutate({ customerDeadline: iso });
	};

	const commitAppointment = (next: Dayjs | null) => {
		const iso = next && next.isValid() ? next.toISOString() : null;
		const currentIso = opportunity.customerAppointment ?? null;
		if (iso === currentIso) {
			// Picker can fire onAccept with the unchanged value (e.g. user opened the
			// picker, didn't change anything, dismissed it). Skip the no-op write so the
			// audit log stays clean.
			return;
		}
		updateFields.mutate({ customerAppointment: iso });
	};

	const commitUrgency = (next: OpportunityUrgency) => {
		if (next === opportunity.urgency) {
			return;
		}
		updateFields.mutate({ urgency: next });
	};

	return (
		<Paper variant='outlined' sx={{ p: 2 }}>
			<Stack useFlexGap spacing={2.5}>
				<ExtractedField label='Klant' value={opportunity.customerName} />
				<ExtractedField label='E-mail' value={opportunity.customerEmail} />
				<StandaloneField
					name='address'
					label='Adres'
					value={address}
					onChange={e => setAddress(e.target.value)}
					onBlur={commitAddress}
					placeholder='—'
					fullWidth
					maxLength={500}
				/>
				<ExtractedField label='Aanvraag' value={opportunity.requestType} />
				<StandaloneSelect
					name='urgency'
					label='Urgentie'
					value={opportunity.urgency}
					fullWidth
					size='small'
					options={OPPORTUNITY_URGENCIES.map(u => ({
						id: u,
						label: OPPORTUNITY_URGENCY_LABELS_NL[u]
					}))}
					onChange={e => commitUrgency(e.target.value as OpportunityUrgency)}
				/>
				<StandaloneDatePicker
					name='deadline'
					label='Deadline'
					value={opportunity.customerDeadline ? dayjs(opportunity.customerDeadline) : null}
					fullWidth
					size='small'
					onAccept={commitDeadline}
				/>
				<Box>
					<Label component='label' color='text.secondary'>
						Afspraak
					</Label>
					<Button
						variant='outlined'
						color='inherit'
						fullWidth
						onClick={e => setAppointmentAnchorEl(e.currentTarget)}
						endIcon={<AppIcon name='calendar' size='medium' />}
						sx={{
							mt: 0.5,
							justifyContent: 'space-between',
							textTransform: 'none',
							fontWeight: 'normal',
							color: opportunity.customerAppointment ? 'text.primary' : 'text.secondary'
						}}
					>
						{opportunity.customerAppointment
							? toReadableDateTime(opportunity.customerAppointment)
							: 'Kies een tijd'}
					</Button>
					<AvailabilityPicker
						open={Boolean(appointmentAnchorEl)}
						anchorEl={appointmentAnchorEl}
						connectedProviders={connectedProviders}
						value={opportunity.customerAppointment ? dayjs(opportunity.customerAppointment) : null}
						onClose={() => setAppointmentAnchorEl(null)}
						onConfirm={iso => commitAppointment(iso ? dayjs(iso) : null)}
					/>
				</Box>
				<StandaloneSelect
					name='assignee'
					label='Toegewezen aan'
					value={opportunity.assignedToUserId ?? ASSIGNEE_NONE}
					fullWidth
					size='small'
					disabled={assign.isPending}
					onChange={e => commitAssignee(e.target.value as string)}
					options={[
						{ id: ASSIGNEE_NONE, label: 'Niemand' },
						...memberships.map(m => ({
							id: m.user.id,
							label: m.user.name?.trim() || m.user.email
						}))
					]}
				/>

				{(updateFields.isError || assign.isError) && (
					<Banner tone='error'>
						Bijwerken mislukt:{' '}
						{updateFields.error instanceof Error
							? updateFields.error.message
							: assign.error instanceof Error
								? assign.error.message
								: 'Onbekende fout'}
					</Banner>
				)}
				<Box>
					<BodySmall color='text.secondary'>Onderdelen</BodySmall>
					{opportunity.deliverableHints.length === 0 ? (
						<BodySmall>–</BodySmall>
					) : (
						<Stack direction='row' useFlexGap spacing={0.5} sx={{ flexWrap: 'wrap', mt: 0.5 }}>
							{opportunity.deliverableHints.map(hint => (
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
			<BodySmall color='text.secondary'>{label}</BodySmall>
			<BodySmall>{value ?? '—'}</BodySmall>
		</Box>
	);
}

/**
 *  follow-up — staged-attachments panel under the draft editor. Renders one chip
 * per attached file with a download (click) + delete (× icon) affordance. On SENT
 * drafts the panel collapses into a read-only list (no upload, no delete) so the
 * record of what was attached is preserved.
 */
function AttachmentsPanel({
	opportunityId,
	attachments,
	readOnly,
	isUploading,
	uploadError,
	onUpload,
	deletingId,
	deleteError,
	onDelete
}: {
	opportunityId: string;
	attachments: ReplyDraftAttachment[];
	readOnly: boolean;
	isUploading: boolean;
	uploadError: unknown;
	deletingId: string | null;
	deleteError: unknown;
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
		<Paper variant='outlined' sx={{ p: 2, mt: 2 }}>
			<Stack
				direction='row'
				useFlexGap
				spacing={1}
				sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}
			>
				<Label>Bijlagen{attachments.length > 0 ? ` (${attachments.length})` : ''}</Label>
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
							disabled={isUploading}
							startIcon={isUploading ? <CircularProgress size={14} /> : null}
							onClick={() => fileInputRef.current?.click()}
						>
							{isUploading ? 'Uploaden…' : 'Bijlage toevoegen'}
						</Button>
					</>
				)}
			</Stack>
			<QuotePdfAttachSelect opportunityId={opportunityId} attachments={attachments} readOnly={readOnly} />
			{attachments.length === 0 ? (
				<BodySmall color='text.secondary'>Geen bijlagen toegevoegd.</BodySmall>
			) : (
				<Stack direction='row' useFlexGap spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
					{attachments.map(attachment => (
						<Chip
							key={attachment.id}
							label={`${attachment.filename} · ${toReadableBytes(attachment.sizeBytes)}`}
							component='a'
							clickable
							href={`/api/opportunities/${opportunityId}/reply-draft/attachments/${attachment.id}/download`}
							target='_blank'
							rel='noopener'
							onDelete={readOnly ? undefined : () => onDelete(attachment.id)}
							disabled={deletingId === attachment.id}
						/>
					))}
				</Stack>
			)}
			{uploadError instanceof Error && (
				<Banner tone='error' sx={{ mt: 1 }}>
					Uploaden mislukt: {uploadError.message}
				</Banner>
			)}
			{deleteError instanceof Error && (
				<Banner tone='error' sx={{ mt: 1 }}>
					Verwijderen mislukt: {deleteError.message}
				</Banner>
			)}
		</Paper>
	);
}

/**
 * Read-only conversational + system timeline. Merges three server arrays into one
 * newest-first list:
 *  - `drafts` — our SENT replies (+ rare `Vervangen` versions superseded mid-edit).
 *  - `customerReplies` — inbound customer messages from thread reconstitution.
 *  - `timeline` — system + owner events (status changes, dismiss/undismiss, auto-cold).
 * Customer replies are nested under their parent SENT draft when the timestamps
 * place them there; everything else lands at the top level sorted by timestamp DESC.
 */
function TimelinePanel({
	opportunityId,
	drafts,
	customerReplies,
	timeline
}: {
	opportunityId: string;
	drafts: ReplyDraft[];
	customerReplies: CustomerReplyEntry[];
	timeline: OpportunityTimelineEvent[];
}) {
	// Heuristic grouping: each customer reply nests under the most-recent SENT draft
	// whose `sentAt` is strictly before the reply's `receivedAt`. That's "the draft
	// the customer was responding to" in practice — true for the common case where
	// they hit Reply on the latest email in their inbox. Replies that arrived BEFORE
	// any sent draft (rare — usually only happens when the opp was created from an
	// already-mid-thread email at backfill time) stay as standalone "orphan" entries
	// merged by timestamp.
	// Cheap proxy for the real linkage (which would require capturing each SENT
	// draft's RFC `Message-Id` from Gmail/Graph and parsing the inbound's
	// `In-Reply-To` header — schema + send-path work we've deferred). Heuristic
	// matches the user-visible result for ~all real conversations.
	// Build an O(1)-lookup map of sent drafts keyed by id, then iterate the pre-filtered
	// sent-only list (newest-first, same order as `drafts`) per reply instead of calling
	// .find() inside the loop — O(n+m) instead of O(n*m).
	const sentDrafts = drafts.filter(d => d.status === 'sent' && d.sentAt !== null);
	const repliesByDraftId = new Map<string, CustomerReplyEntry[]>();
	const orphanReplies: CustomerReplyEntry[] = [];
	for (const reply of customerReplies) {
		// `sentDrafts` is newest-first; the first entry whose sentAt < receivedAt is
		// the most-recent sent draft that predates the reply.
		let target: (typeof sentDrafts)[0] | undefined;
		for (const d of sentDrafts) {
			if (d.sentAt !== null && d.sentAt < reply.receivedAt) {
				target = d;
				break;
			}
		}
		if (target) {
			const existing = repliesByDraftId.get(target.id);
			if (existing) {
				existing.push(reply);
			} else {
				repliesByDraftId.set(target.id, [reply]);
			}
		} else {
			orphanReplies.push(reply);
		}
	}
	// Each draft's reply list: oldest-first (top-down chronological under the draft).
	for (const list of repliesByDraftId.values()) {
		list.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
	}

	// Build the merged outer timeline. Drafts in their natural newest-first order,
	// orphan customer replies merged by timestamp DESC alongside them.
	const draftEntries = drafts.map((draft, index) => ({
		kind: 'draft' as const,
		key: `draft:${draft.id}`,
		timestamp: draft.sentAt ?? draft.updatedAt,
		draft,
		ordinal: drafts.length - index,
		replies: repliesByDraftId.get(draft.id) ?? []
	}));
	const orphanEntries = orphanReplies.map(reply => ({
		kind: 'customer' as const,
		key: `customer:${reply.id}`,
		timestamp: reply.receivedAt,
		reply
	}));
	const systemEntries = timeline.map(event => ({
		kind: 'system' as const,
		key: `system:${event.id}`,
		timestamp: event.occurredAt,
		event
	}));
	const merged = [...draftEntries, ...orphanEntries, ...systemEntries].sort((a, b) =>
		b.timestamp.localeCompare(a.timestamp)
	);

	// Total entry count includes nested customer replies + every system event —
	// "items in this conversation," regardless of where they're rendered.
	const totalEntries = drafts.length + customerReplies.length + timeline.length;

	return (
		<Box sx={{ mt: 4 }}>
			<H3 sx={{ mb: 1 }}>Tijdlijn ({totalEntries})</H3>
			<Stack useFlexGap spacing={1}>
				{merged.map(entry => {
					if (entry.kind === 'draft') {
						return (
							<ReplyDraftHistoryEntry
								key={entry.key}
								opportunityId={opportunityId}
								draft={entry.draft}
								ordinal={entry.ordinal}
								replies={entry.replies}
							/>
						);
					}
					if (entry.kind === 'customer') {
						return <CustomerReplyHistoryEntry key={entry.key} reply={entry.reply} />;
					}
					return <TimelineEventEntry key={entry.key} event={entry.event} />;
				})}
			</Stack>
		</Box>
	);
}

const TIMELINE_DISMISS_REASON_LABELS_NL: Record<'not_a_quote' | 'duplicate' | 'spam' | 'other', string> = {
	not_a_quote: 'Geen offerteaanvraag',
	duplicate: 'Duplicaat',
	spam: 'Spam',
	other: 'Andere reden'
};

interface TimelineEventCopy {
	chipLabel: string;
	chipColor: 'default' | 'info' | 'success' | 'warning' | 'error';
	headline: string;
	detail: string | null;
}

function describeTimelineEvent(event: OpportunityTimelineEvent): TimelineEventCopy {
	switch (event.kind) {
		case 'status_changed': {
			const prev = event.previousStatus ? OPPORTUNITY_STATUS_LABELS_NL[event.previousStatus] : null;
			const next = OPPORTUNITY_STATUS_LABELS_NL[event.nextStatus];
			return {
				chipLabel: 'Status',
				chipColor: 'default',
				headline: prev ? `Status: ${prev} → ${next}` : `Status: ${next}`,
				detail: null
			};
		}
		case 'auto_cold':
			return {
				chipLabel: 'Auto-koud',
				chipColor: 'info',
				headline: `Automatisch op Koud gezet na ${event.daysSinceSent} dag${event.daysSinceSent === 1 ? '' : 'en'} stilte`,
				detail: `Drempel: ${event.coldAfterDays} dag${event.coldAfterDays === 1 ? '' : 'en'}.`
			};
		case 'dismissed': {
			const reasonLabel = TIMELINE_DISMISS_REASON_LABELS_NL[event.reason];
			return {
				chipLabel: 'Afgewezen',
				chipColor: 'warning',
				headline: `Aanvraag afgewezen — ${reasonLabel}`,
				detail: event.notes
			};
		}
		case 'undismissed':
			return {
				chipLabel: 'Hersteld',
				chipColor: 'success',
				headline: 'Aanvraag teruggezet uit afgewezen',
				detail: event.previousReason
					? `Eerdere reden: ${TIMELINE_DISMISS_REASON_LABELS_NL[event.previousReason]}`
					: null
			};
		case 'fields_updated': {
			const fieldLabels = event.changes.map(c => TIMELINE_FIELD_LABELS_NL[c.field]);
			return {
				chipLabel: 'Gegevens',
				chipColor: 'default',
				headline:
					event.changes.length === 1
						? `${fieldLabels[0]} bijgewerkt`
						: `${event.changes.length} velden bijgewerkt: ${fieldLabels.join(', ')}`,
				detail: event.changes.map(formatFieldChange).join('\n')
			};
		}
		case 'assigned': {
			const prev = event.previousAssigneeName ?? (event.previousAssigneeUserId ? 'onbekend' : 'niemand');
			const next = event.nextAssigneeName ?? (event.nextAssigneeUserId ? 'onbekend' : 'niemand');
			return {
				chipLabel: 'Toewijzing',
				chipColor: 'info',
				headline:
					event.nextAssigneeUserId === null
						? `Toewijzing verwijderd (was ${prev})`
						: event.previousAssigneeUserId === null
							? `Toegewezen aan ${next}`
							: `Toewijzing: ${prev} → ${next}`,
				detail: null
			};
		}
		case 'received_via_mailbox':
			return {
				chipLabel: 'Binnengekomen',
				chipColor: 'default',
				headline: `Aanvraag binnengekomen via ${event.mailboxEmail}`,
				detail: event.mailboxOwnerName ? `Mailbox van ${event.mailboxOwnerName}` : null
			};
		case 'quote_created':
			return {
				chipLabel: 'Offerte',
				chipColor: 'success',
				headline:
					event.lineCount === 1
						? 'Offerte opgesteld (1 regel)'
						: `Offerte opgesteld (${event.lineCount} regels)`,
				detail: null
			};
		case 'quote_pdf_generated':
			return {
				chipLabel: 'Offerte-PDF',
				chipColor: 'success',
				headline: 'Offerte-PDF gegenereerd',
				detail: event.filename
			};
	}
}

const TIMELINE_FIELD_LABELS_NL: Record<OpportunityFieldChange['field'], string> = {
	urgency: 'Urgentie',
	address: 'Adres',
	customerDeadline: 'Deadline',
	customerAppointment: 'Afspraak'
};

function formatFieldValue(change: OpportunityFieldChange, side: 'before' | 'after'): string {
	const value = change[side];
	if (value === null) {
		return '—';
	}
	switch (change.field) {
		case 'urgency':
			return OPPORTUNITY_URGENCY_LABELS_NL[value as OpportunityUrgency];
		case 'customerDeadline':
			return toReadableDate(value);
		case 'customerAppointment':
			return toReadableDateTime(value);
		case 'address':
			return value;
	}
}

function formatFieldChange(change: OpportunityFieldChange): string {
	return `${TIMELINE_FIELD_LABELS_NL[change.field]}: ${formatFieldValue(change, 'before')} → ${formatFieldValue(change, 'after')}`;
}

function TimelineEventEntry({ event }: { event: OpportunityTimelineEvent }) {
	const copy = describeTimelineEvent(event);

	return (
		<Paper variant='outlined' sx={{ px: 2, py: 1.25, bgcolor: 'background.default' }}>
			<Stack
				direction='row'
				useFlexGap
				spacing={1}
				sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5, width: '100%' }}
			>
				<Chip size='small' label={copy.chipLabel} color={copy.chipColor} variant='outlined' />
				<BodySmall fontWeight='medium'>{copy.headline}</BodySmall>
				<BodySmall color='text.secondary'>
					· {toReadableDateTime(event.occurredAt)}
					{event.actorName && ` · door ${event.actorName}`}
				</BodySmall>
			</Stack>
			{copy.detail && (
				<BodySmall color='text.secondary' sx={{ display: 'block', mt: 0.5, pl: 0.25, whiteSpace: 'pre-wrap' }}>
					{copy.detail}
				</BodySmall>
			)}
		</Paper>
	);
}

function CustomerReplyHistoryEntry({ reply }: { reply: CustomerReplyEntry }) {
	const isOutbound = reply.direction === 'outbound';
	const senderLabel = reply.fromName ?? reply.fromEmail ?? (isOutbound ? 'Jij' : 'Klant');
	const chipLabel = isOutbound ? 'Jij' : 'Klant';
	const chipColor = isOutbound ? 'default' : 'info';
	const verb = isOutbound ? 'verzond' : 'antwoordde';
	const accentColor = isOutbound ? 'grey.500' : 'info.light';
	const backgroundColor = isOutbound ? 'grey.50' : '#F5F1E8';

	return (
		<Accordion variant='outlined' disableGutters sx={{ bgcolor: backgroundColor }}>
			<AccordionSummary sx={{ '& .MuiAccordionSummary-content': { my: 1 } }}>
				<Stack
					direction='row'
					useFlexGap
					spacing={1}
					sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5, width: '100%' }}
				>
					<Chip size='small' label={chipLabel} color={chipColor} variant='filled' />
					<BodySmall fontWeight='medium'>{senderLabel}</BodySmall>
					<BodySmall color='text.secondary'>
						· {verb} {toReadableDateTime(reply.receivedAt)}
					</BodySmall>
					{reply.wasDetectedAsCloser && (
						<Chip
							size='small'
							label='Afsluiter — geen concept'
							color='default'
							variant='outlined'
							title='Offertum herkende dit bericht als een afronding. Klik "Concept-vervolg opstellen" als je toch wilt antwoorden.'
						/>
					)}
				</Stack>
			</AccordionSummary>
			<AccordionDetails sx={{ pt: 0 }}>
				<BodySmall
					component='pre'
					sx={{
						whiteSpace: 'pre-wrap',
						fontFamily: 'inherit',
						m: 0,
						color: 'text.primary',
						borderLeft: '3px solid',
						borderColor: accentColor,
						pl: 2
					}}
				>
					{reply.body || '(geen tekstuele inhoud)'}
				</BodySmall>
			</AccordionDetails>
		</Accordion>
	);
}

function ReplyDraftHistoryEntry({
	opportunityId,
	draft,
	ordinal,
	replies
}: {
	opportunityId: string;
	draft: ReplyDraft;
	ordinal: number;
	replies: CustomerReplyEntry[];
}) {
	const isSent = draft.status === 'sent';
	const timestamp = draft.sentAt ?? draft.updatedAt;
	const headerText = isSent
		? `Verzonden ${toReadableDateTime(timestamp)}`
		: `Vervangen ${toReadableDateTime(timestamp)}`;

	return (
		<Accordion variant='outlined' disableGutters>
			<AccordionSummary sx={{ '& .MuiAccordionSummary-content': { my: 1 } }}>
				<Stack
					direction='row'
					useFlexGap
					spacing={1}
					sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5, width: '100%' }}
				>
					<BodySmall fontWeight='bold'>v{ordinal}</BodySmall>
					<Chip
						size='small'
						label={isSent ? 'Verzonden' : 'Vervangen'}
						color={isSent ? 'success' : 'default'}
						variant={isSent ? 'filled' : 'outlined'}
					/>
					{draft.kind === 'check_in' && (
						<Chip size='small' label='Automatische follow-up' color='info' variant='outlined' />
					)}
					<BodySmall color='text.secondary'>{headerText}</BodySmall>
					{draft.attachments.length > 0 && (
						<BodySmall color='text.secondary'>
							· {draft.attachments.length} bijlage{draft.attachments.length === 1 ? '' : 'n'}
						</BodySmall>
					)}
					{replies.length > 0 && (
						<Chip
							size='small'
							label={`${replies.length} ${replies.length === 1 ? 'antwoord' : 'antwoorden'}`}
							color='info'
							variant='outlined'
						/>
					)}
				</Stack>
			</AccordionSummary>
			<AccordionDetails sx={{ pt: 0 }}>
				<BodySmall
					component='pre'
					sx={{
						whiteSpace: 'pre-wrap',
						fontFamily: 'inherit',
						m: 0,
						color: 'text.primary',
						borderLeft: '3px solid',
						borderColor: 'divider',
						pl: 2
					}}
				>
					{draft.body}
				</BodySmall>
				{draft.attachments.length > 0 && (
					<Box sx={{ mt: 2 }}>
						<BodySmall color='text.secondary' sx={{ display: 'block', mb: 0.5 }}>
							Bijlagen
						</BodySmall>
						<Stack direction='row' useFlexGap spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
							{draft.attachments.map(attachment => (
								<Chip
									key={attachment.id}
									size='small'
									label={`${attachment.filename} · ${toReadableBytes(attachment.sizeBytes)}`}
									component='a'
									clickable
									href={`/api/opportunities/${opportunityId}/reply-draft/attachments/${attachment.id}/download`}
									target='_blank'
									rel='noopener'
								/>
							))}
						</Stack>
					</Box>
				)}
				{replies.length > 0 && (
					<Box sx={{ mt: 2, ml: 1, pl: 1, borderLeft: '2px solid', borderColor: 'info.light' }}>
						<BodySmall color='text.secondary' sx={{ display: 'block', mb: 0.5 }}>
							Antwoorden van de klant op deze versie
						</BodySmall>
						<Stack useFlexGap spacing={0.5}>
							{replies
								.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
								.map(reply => (
									<CustomerReplyHistoryEntry key={reply.id} reply={reply} />
								))}
						</Stack>
					</Box>
				)}
			</AccordionDetails>
		</Accordion>
	);
}

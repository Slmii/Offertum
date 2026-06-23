import { AppIcon } from '@/components/AppIcon.component';
import { Banner } from '@/components/Banner.component';
import { ExpiryActionCard } from '@/components/ExpiryActionCard.component';
import { PillSelect, type PillSelectOption } from '@/components/PillSelect.component';
import { SectionError } from '@/components/SectionError.component';
import { BodySmall, H1, H2 } from '@/components/Text.component';
import { useToast } from '@/lib/hooks/use-toast';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { billingStatusQueryOptions, isBillingEntitled } from '@/lib/queries/billing.queries';
import { ExpiryKeys, opportunityExpiryActionQueryOptions } from '@/lib/queries/expiry.queries';
import {
	opportunityDetailQueryOptions,
	useComposeFollowupReplyDraft,
	useDeleteReplyDraftAttachment,
	useRegenerateReplyDraft,
	useSendReplyDraft,
	useUpdateOpportunityStatus,
	useUpdateReplyDraft,
	useUploadReplyDraftAttachment
} from '@/lib/queries/opportunities.queries';
import { quoteDraftsQueryOptions } from '@/lib/queries/quote-drafts.queries';
import { membershipsQueryOptions, myMembershipQueryOptions } from '@/lib/queries/team.queries';
import { toDaysSinceLabel, toReadableTimestamp } from '@/lib/utils/date.utils';
import {
	getStatusOptionsForCurrent,
	OPPORTUNITY_STATUS_LABELS_NL,
	OPPORTUNITY_STATUS_PILL_TONES,
	OPPORTUNITY_URGENCY_COLORS,
	OPPORTUNITY_URGENCY_LABELS_NL,
	opportunityCustomerLabel
} from '@/lib/utils/opportunity.utils';
import { isReplyDraftEditable } from '@/lib/utils/reply-draft-editability';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import { useTheme } from '@mui/material/styles';
import { type OpportunityStatus } from '@offertum/shared';
import { useIsMutating, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { AssigneePicker } from './-components/Details/AssigneePicker.component';
import { AttachmentsPanel } from './-components/Details/AttachmentsPanel.component';
import { BackToListLink } from './-components/Details/BackToListLink.component';
import { ComposerLoadingState } from './-components/Details/ComposerLoadingState.component';
import { ContextRailCard } from './-components/Details/ContextRailCard.component';
import { conversationMessageCount, ConversationThread } from './-components/Details/ConversationThread.component';
import { DraftEditor } from './-components/Details/DraftEditor.component';
import { ExtractedFieldsPanel } from './-components/Details/ExtractedFieldsPanel.component';
import { LockedReplyPanel } from './-components/Details/LockedReplyPanel.component';
import { RailQuoteCard } from './-components/Details/RailQuoteCard.component';
import { SendConfirmDialog } from './-components/Details/SendConfirmDialog.component';
import { SentComposerState } from './-components/Details/SentComposerState.component';
import { StatusPipeline } from './-components/Details/StatusPipeline.component';
import { Timeline } from './-components/Details/Timeline.component';
import { WonComposerState } from './-components/Details/WonComposerState.component';
import { DismissDialog } from './-components/DismissDialog.component';

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
	const { data: quoteDrafts } = useSuspenseQuery(quoteDraftsQueryOptions(id));
	// Drives the composer's quote affordance: view an existing offerte vs. generate the first one.
	const hasQuote = quoteDrafts.drafts.length > 0;
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
	const { tokens } = useTheme();
	const [sendConfirmOpen, setSendConfirmOpen] = useState(false);
	const [dismissOpen, setDismissOpen] = useState(false);

	// Whole conversation collapses behind the "Gesprek" header (always toggleable, even for a
	// single message), but starts open so the full thread is visible by default.
	const messageCount = conversationMessageCount(opportunity.replyDraftHistory, opportunity.customerReplies);
	const isThreadCollapsible = true;
	const [isThreadOpen, setIsThreadOpen] = useState(true);

	// Mailbox owner (whose inbox the request landed in) — sourced from the creation-time
	// `received_via_mailbox` timeline event; drives the assignee picker's "Mailbox-eigenaar" tag.
	const mailboxEvent = opportunity.timeline.find(event => event.kind === 'received_via_mailbox');
	const mailboxOwnerUserId = mailboxEvent?.kind === 'received_via_mailbox' ? mailboxEvent.mailboxOwnerUserId : null;
	const mailboxOwnerName = mailboxEvent?.kind === 'received_via_mailbox' ? mailboxEvent.mailboxOwnerName : null;

	const replyDraft = opportunity.replyDraft;
	const status = opportunity.status;
	// editability collapses to draft-state only. Opp.status no longer
	// gates the editor; courtesy follow-ups on a WON/LOST deal stay editable until
	// they're sent. `null` draftStatus means "no draft generated yet" → editable
	// (caller decides); the detail page only renders the editor once a draft exists.
	const isDraftEditable = isReplyDraftEditable(replyDraft?.status);
	// The detail page's check-in variant: the current draft is an Offertum auto follow-up that
	// hasn't been sent yet → show the prominent review ribbon + a filled badge.
	const isPendingCheckIn = replyDraft?.kind === 'check_in' && replyDraft.status !== 'sent';
	const checkInSilentSince = opportunity.replyDraftSentAt ? toDaysSinceLabel(opportunity.replyDraftSentAt) : null;
	// The writing-style-change banner offers its own "Regenereer in mijn stijl" — when it's shown
	// we hide the composer header's duplicate regenerate button so there's only one call to action.
	const showRegenerateHint = Boolean(
		isEntitled && replyDraft && isDraftEditable && shouldShowRegenerateHint({ me, replyDraft })
	);

	// True while the expiry card's "Laatste herinnering" (LAST_FOLLOWUP) action is generating a
	// reply draft. That mutation lives in ExpiryActionCard, so we observe it via useIsMutating and
	// show the composer's loading state for the duration (other expiry actions don't draft).
	const isGeneratingFollowup =
		useIsMutating({
			mutationKey: ExpiryKeys.take(id),
			predicate: mutation => (mutation.state.variables as { kind?: string } | undefined)?.kind === 'LAST_FOLLOWUP'
		}) > 0;

	// Status switcher — surfaced on the context-rail pill (the header pipeline mirrors it
	// read-only). Options stay fully-open (pattern #20); ordering is just UX guidance.
	const statusOptions: PillSelectOption<OpportunityStatus>[] = getStatusOptionsForCurrent(status).map(s => ({
		id: s,
		label: OPPORTUNITY_STATUS_LABELS_NL[s],
		tone: OPPORTUNITY_STATUS_PILL_TONES[s]
	}));
	const handleStatusChange = (next: OpportunityStatus) =>
		updateStatus.mutate(
			{ id: opportunity.id, status: next },
			{
				onSuccess: () => toast.success('Opgeslagen', 'Status bijgewerkt.'),
				onError: err =>
					toast.error('Bijwerken mislukt', err instanceof Error ? err.message : 'Probeer het opnieuw.')
			}
		);

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

	// Regenerate-in-my-style — shared by the composer-header button + the "writing style updated"
	// hint banner. Adopts the new body locally + toasts on failure (no inline error banner).
	const handleRegenerate = () =>
		regenerateDraft.mutate(undefined, {
			onSuccess: next => {
				setBody(next.body);
				lastSavedRef.current = next.body;
			},
			onError: err =>
				toast.error('Regenereren mislukt', err instanceof Error ? err.message : 'Probeer het opnieuw.')
		});

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
		updateDraft.mutate(
			{ body: debouncedBody },
			{
				onError: err =>
					toast.error('Opslaan mislukt', err instanceof Error ? err.message : 'Probeer het opnieuw.')
			}
		);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [debouncedBody, isDraftEditable]);

	return (
		<Stack>
			<BackToListLink />
			<Box
				sx={{
					display: 'flex',
					flexDirection: { xs: 'column', md: 'row' },
					alignItems: { md: 'flex-start' },
					justifyContent: 'space-between',
					gap: 2,
					mt: 1,
					mb: 3
				}}
			>
				<Box sx={{ minWidth: 0 }}>
					<H1 sx={{ fontSize: 24 }}>{opportunityCustomerLabel(opportunity)}</H1>
					<Stack
						direction='row'
						useFlexGap
						spacing={1}
						sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5, mt: 0.5 }}
					>
						<BodySmall color='textSecondary'>{opportunity.requestType}</BodySmall>
						<BodySmall color='textSecondary'>·</BodySmall>
						<Box
							sx={{
								width: 9,
								height: 9,
								borderRadius: '50%',
								backgroundColor: OPPORTUNITY_URGENCY_COLORS[opportunity.urgency],
								flexShrink: 0
							}}
							aria-hidden='true'
						/>
						<BodySmall color='textSecondary'>
							{OPPORTUNITY_URGENCY_LABELS_NL[opportunity.urgency]}
						</BodySmall>
						<BodySmall color='textSecondary'>·</BodySmall>
						<PillSelect
							value={status}
							options={statusOptions}
							onChange={handleStatusChange}
							disabled={updateStatus.isPending}
							ariaLabel='Status wijzigen'
						/>
						<BodySmall color='textSecondary'>·</BodySmall>
						<BodySmall color='textSecondary'>
							Binnengekomen {toReadableTimestamp(opportunity.internalDate)}
						</BodySmall>
					</Stack>
				</Box>
				<StatusPipeline status={status} />
			</Box>

			<Box
				sx={{
					display: 'grid',
					gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 320px' },
					gap: 3.5,
					alignItems: 'start'
				}}
			>
				<Box sx={{ minWidth: 0, order: { xs: 2, md: 1 } }}>
					<Stack
						direction='row'
						useFlexGap
						spacing={1}
						sx={{
							alignItems: 'center',
							mb: 1.5,
							...(isThreadCollapsible && { cursor: 'pointer', userSelect: 'none' })
						}}
						role={isThreadCollapsible ? 'button' : undefined}
						tabIndex={isThreadCollapsible ? 0 : undefined}
						aria-expanded={isThreadCollapsible ? isThreadOpen : undefined}
						onClick={isThreadCollapsible ? () => setIsThreadOpen(prev => !prev) : undefined}
						onKeyDown={
							isThreadCollapsible
								? event => {
										if (event.key === 'Enter' || event.key === ' ') {
											event.preventDefault();
											setIsThreadOpen(prev => !prev);
										}
									}
								: undefined
						}
					>
						<AppIcon name='message' size='medium' />
						<H2 sx={{ fontSize: 18 }}>Gesprek</H2>
						<BodySmall color='textSecondary' sx={{ ml: 'auto' }}>
							{messageCount} {messageCount === 1 ? 'bericht' : 'berichten'}
						</BodySmall>
						{isThreadCollapsible && (
							<Box
								component='span'
								aria-hidden='true'
								sx={{
									display: 'inline-flex',
									color: 'text.disabled',
									transition: `transform ${tokens.motion.durFast}ms`,
									transform: isThreadOpen ? 'rotate(180deg)' : 'none'
								}}
							>
								<AppIcon name='chevron-down' size='small' />
							</Box>
						)}
					</Stack>
					<Collapse in={isThreadCollapsible ? isThreadOpen : true}>
						<ConversationThread
							opportunityId={id}
							original={{
								subject: opportunity.subject,
								fromName: opportunity.fromName,
								fromEmail: opportunity.fromEmail,
								body: opportunity.originalEmailBody,
								receivedAt: opportunity.internalDate
							}}
							sentDrafts={opportunity.replyDraftHistory}
							customerReplies={opportunity.customerReplies}
						/>
					</Collapse>

					{/* Writing-style nudges — shown directly above the composer (the "Jouw antwoord"
					    section) per the design, only while an editable, non-check-in draft is composed. */}
					{isEntitled &&
						replyDraft &&
						isDraftEditable &&
						!isPendingCheckIn &&
						me.user.hasTonePlaybook === false && (
							<Banner
								tone='info'
								sx={{ mb: 1.5 }}
								action={
									<Button
										color='inherit'
										size='small'
										component={Link}
										to='/settings/writing-style'
										sx={{ minWidth: 200 }}
									>
										Schrijfstijl instellen
									</Button>
								}
							>
								Vertel ons in een paar zinnen hoe je schrijft, dan klinken concept-antwoorden zoals jou.
								Nu gebruiken we een neutrale standaardtoon.
							</Banner>
						)}

					{showRegenerateHint && (
						<Banner
							tone='info'
							sx={{ mb: 1.5 }}
							action={
								<Button
									color='inherit'
									size='small'
									onClick={handleRegenerate}
									sx={{ minWidth: 200 }}
									disabled={regenerateDraft.isPending}
									startIcon={
										regenerateDraft.isPending ? (
											<CircularProgress size={14} />
										) : (
											<AppIcon name='sparkles' size='small' />
										)
									}
								>
									{regenerateDraft.isPending ? 'Bezig…' : 'Regenereer in mijn stijl'}
								</Button>
							}
						>
							Je schrijfstijl is bijgewerkt sinds dit concept werd opgesteld. Wil je het concept opnieuw
							laten genereren in je nieuwe stijl?
						</Banner>
					)}

					{isEntitled ? (
						isGeneratingFollowup ? (
							<ComposerLoadingState customerName={opportunity.customerName} />
						) : status === 'won' ? (
							<WonComposerState
								customerName={opportunity.customerName}
								appointmentIso={opportunity.customerAppointment}
								isComposing={composeFollowup.isPending}
								onComposeFollowup={() => composeFollowup.mutate()}
							/>
						) : replyDraft ? (
							replyDraft.status === 'sent' && replyDraft.sentAt ? (
								<SentComposerState
									sentAtIso={replyDraft.sentAt}
									version={opportunity.replyDraftHistory.filter(d => d.status === 'sent').length}
									isComposing={composeFollowup.isPending}
									onComposeFollowup={() => composeFollowup.mutate()}
								/>
							) : regenerateDraft.isPending ? (
								<ComposerLoadingState customerName={opportunity.customerName} />
							) : (
								<Box
									sx={{
										border: `1px solid ${isPendingCheckIn ? tokens.color.accent[500] : tokens.color.lineStrong}`,
										borderRadius: `${tokens.radius.lg}px`,
										backgroundColor: tokens.color.surface,
										boxShadow: tokens.shadow[2],
										overflow: 'hidden'
									}}
								>
									{/* Composer header band — icon tile + title (+ check-in subtitle) + regenerate */}
									<Box
										sx={{
											py: 1.75,
											px: 2.25,
											borderBottom: `1px solid ${isPendingCheckIn ? tokens.color.accent[300] : tokens.color.line}`,
											backgroundColor: isPendingCheckIn
												? tokens.color.accent[50]
												: tokens.color.paper2,
											display: 'flex',
											alignItems: 'center',
											gap: 1.25
										}}
									>
										<Box
											component='span'
											sx={{
												width: 28,
												height: 28,
												borderRadius: `${tokens.radius.md}px`,
												backgroundColor: isPendingCheckIn
													? tokens.color.accent[500]
													: tokens.color.surface,
												border: isPendingCheckIn
													? 'none'
													: `1px solid ${tokens.color.lineStrong}`,
												color: isPendingCheckIn ? tokens.color.accent.fg : tokens.color.ink3,
												display: 'inline-flex',
												alignItems: 'center',
												justifyContent: 'center',
												flexShrink: 0
											}}
										>
											<AppIcon
												name={isPendingCheckIn ? 'sparkles' : 'corner-up-left'}
												size='small'
											/>
										</Box>
										<Box sx={{ minWidth: 0, flex: 1 }}>
											<Box sx={{ fontSize: 14, fontWeight: 'bold', color: tokens.color.ink1 }}>
												{isPendingCheckIn ? 'Automatische follow-up' : 'Jouw antwoord'}
											</Box>
											{isPendingCheckIn && (
												<Box sx={{ fontSize: 12, color: tokens.color.accent[700], mt: 0.25 }}>
													Opgesteld door Offertum — klant is{' '}
													{checkInSilentSince ?? 'een paar dagen'} stil
												</Box>
											)}
										</Box>
										{me.user.hasTonePlaybook && !showRegenerateHint && (
											<Button
												size='small'
												variant='text'
												onClick={handleRegenerate}
												disabled={regenerateDraft.isPending}
												startIcon={
													regenerateDraft.isPending ? (
														<CircularProgress size={14} />
													) : (
														<AppIcon
															name={isPendingCheckIn ? 'refresh' : 'sparkles'}
															size='small'
														/>
													)
												}
											>
												{regenerateDraft.isPending
													? 'Bezig…'
													: isPendingCheckIn
														? 'Opnieuw'
														: 'Regenereer in mijn stijl'}
											</Button>
										)}
									</Box>

									{/* Editor */}
									<Box sx={{ p: 2.25 }}>
										<DraftEditor
											body={body}
											setBody={setBody}
											isSaving={updateDraft.isPending}
											lastUpdatedIso={replyDraft.updatedAt}
											readOnly={!isDraftEditable}
										/>
										<AttachmentsPanel
											opportunityId={id}
											attachments={replyDraft.attachments}
											readOnly={!isDraftEditable}
											isUploading={uploadAttachment.isPending}
											onUpload={file =>
												uploadAttachment.mutate(
													{ file },
													{
														onError: err =>
															toast.error(
																'Uploaden mislukt',
																err instanceof Error
																	? err.message
																	: 'Probeer het opnieuw.'
															)
													}
												)
											}
											deletingId={
												deleteAttachment.isPending
													? (deleteAttachment.variables?.attachmentId ?? null)
													: null
											}
											onDelete={attachmentId =>
												deleteAttachment.mutate(
													{ attachmentId },
													{
														onError: err =>
															toast.error(
																'Verwijderen mislukt',
																err instanceof Error
																	? err.message
																	: 'Probeer het opnieuw.'
															)
													}
												)
											}
										/>
									</Box>

									{/* Action bar — dismiss (left) + send (right) */}
									<Box
										sx={{
											py: 1.75,
											px: 2.25,
											borderTop: `1px solid ${tokens.color.line}`,
											backgroundColor: tokens.color.paper2,
											display: 'flex',
											alignItems: 'center',
											justifyContent: 'space-between',
											gap: 1.5,
											flexWrap: 'wrap',
											rowGap: 1
										}}
									>
										<Button
											variant='contained'
											color='error'
											size='medium'
											onClick={() => setDismissOpen(true)}
											startIcon={<AppIcon name='x' size='small' />}
										>
											Geen offerteaanvraag
										</Button>
										<Box
											sx={{
												display: 'flex',
												alignItems: 'center',
												gap: 1,
												flexWrap: 'wrap',
												rowGap: 1
											}}
										>
											{/* Quote affordance — view the existing offerte, or generate the first
											    one when none exists yet. Its own page is still deferred, so no-op for now. */}
											<Button
												variant='outlined'
												color='inherit'
												size='medium'
												startIcon={
													<AppIcon name={hasQuote ? 'file-text' : 'file-plus'} size='small' />
												}
											>
												{hasQuote ? 'Offerte bekijken' : 'Genereer offerte'}
											</Button>
											<Button
												variant='contained'
												size='medium'
												startIcon={
													sendDraft.isPending ? (
														<CircularProgress size={14} />
													) : (
														<AppIcon name='send' size='small' />
													)
												}
												onClick={() => setSendConfirmOpen(true)}
												disabled={
													sendDraft.isPending ||
													updateDraft.isPending ||
													regenerateDraft.isPending ||
													body.trim().length === 0
												}
											>
												{sendDraft.isPending ? 'Versturen…' : 'Verstuur'}
											</Button>
										</Box>
									</Box>
								</Box>
							)
						) : opportunity.dismissedAt ? (
							<Paper variant='outlined' sx={{ p: 4, textAlign: 'center', borderStyle: 'dashed' }}>
								<BodySmall color='textSecondary'>
									Deze offerteaanvraag is afgewezen: er wordt geen concept-antwoord opgesteld.
								</BodySmall>
							</Paper>
						) : (
							<ComposerLoadingState customerName={opportunity.customerName} />
						)
					) : (
						<LockedReplyPanel isOwner={isOwner} />
					)}
					{opportunity.timeline.length > 0 && (
						<Box sx={{ mt: 4 }}>
							<Stack direction='row' useFlexGap spacing={1} sx={{ alignItems: 'center', mb: 2 }}>
								<AppIcon name='clock' size='medium' />
								<H2 sx={{ fontSize: 18 }}>Tijdlijn</H2>
								<BodySmall color='textSecondary' sx={{ ml: 'auto' }}>
									{opportunity.timeline.length}{' '}
									{opportunity.timeline.length === 1 ? 'gebeurtenis' : 'gebeurtenissen'}
								</BodySmall>
							</Stack>
							<Paper variant='outlined' sx={{ p: 3 }}>
								<Timeline events={opportunity.timeline} />
							</Paper>
						</Box>
					)}
				</Box>
				<Box sx={{ minWidth: 0, order: { xs: 1, md: 2 }, position: { md: 'sticky' }, top: { md: 80 } }}>
					<Stack useFlexGap spacing={1.75}>
						<ContextRailCard
							customerName={opportunity.customerName}
							customerEmail={opportunity.customerEmail}
							customerPhone={opportunity.customerPhone}
						/>
						{isEntitled && <ExpiryActionCard opportunityId={id} isOwner={isOwner} />}
						<RailQuoteCard opportunityId={id} />
						<ExtractedFieldsPanel opportunityId={id} opportunity={opportunity} />
						<AssigneePicker
							opportunityId={id}
							assignedToUserId={opportunity.assignedToUserId}
							mailboxOwnerUserId={mailboxOwnerUserId}
							mailboxOwnerName={mailboxOwnerName}
						/>
					</Stack>
				</Box>
			</Box>

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
			{dismissOpen && (
				<DismissDialog
					opportunityId={id}
					replyDraftSentAt={opportunity.replyDraftSentAt}
					onClose={() => setDismissOpen(false)}
				/>
			)}
		</Stack>
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

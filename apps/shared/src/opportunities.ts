import type { ReplyDraft } from './reply-drafts.js';

export const OPPORTUNITY_STATUSES = ['new', 'replied', 'waiting', 'cold', 'won', 'lost'] as const;

export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export const OPPORTUNITY_URGENCIES = ['emergency', 'high', 'normal', 'low'] as const;
export type OpportunityUrgency = (typeof OPPORTUNITY_URGENCIES)[number];

/**
 * Reason an opportunity was dismissed by the owner. Distinct axis from
 * `OpportunityStatus` per  — `lost` means "real quote we didn't win," not
 * "the classifier was wrong." Surfaced in the dismiss modal + admin precision tile.
 */
export const OPPORTUNITY_DISMISS_REASONS = ['not_a_quote', 'duplicate', 'spam', 'other'] as const;
export type OpportunityDismissReason = (typeof OPPORTUNITY_DISMISS_REASONS)[number];

export interface Opportunity {
	id: string;
	organizationId: string;
	emailAccountId: string;
	rawMessageId: string;
	status: OpportunityStatus;
	aiProvider: string;
	requestType: string;
	urgency: OpportunityUrgency;
	deliverableHints: string[];
	createdAt: string;
	updatedAt: string;
	internalDate: string;
	subject: string | null;
	fromEmail: string | null;
	fromName: string | null;
	threadId: string | null;
	classifierConfidence: number | null;
	classifierReason: string | null;
	customerName: string | null;
	customerEmail: string | null;
	address: string | null;
	customerDeadline: string | null;
	customerAppointment: string | null;
	dismissedAt: string | null;
	dismissReason: OpportunityDismissReason | null;
	dismissedByUserId: string | null;
	/**
	 *  follow-up — ISO timestamp the reply draft was sent at via Quoteom, or `null`
	 * when no reply has been sent (no draft yet, or draft is still pending / edited).
	 * Surfaces on the LIST shape so the dismiss dialog can warn "you already replied;
	 * dismissing won't unsend the email" without an extra detail-view fetch. Distinct
	 * from `Opportunity.status === 'replied'` because the user can manually move an opp
	 * to `replied` without sending via Quoteom, and the dismiss-warning copy specifically
	 * mentions the SENT email — keep the two signals decoupled.
	 */
	replyDraftSentAt: string | null;
	/**
	 * `true` when the LATEST `ReplyDraft` on this opp has `kind = 'check_in'` AND
	 * is not yet sent (status ≠ `sent`). Drives the "Automatische follow-up" indicator
	 * on the opportunity list so owners can spot scheduler-generated check-ins waiting
	 * for review without opening every row. Goes back to `false` the moment the owner
	 * sends it (the SENT draft no longer needs a UI cue — the regular status chip + sent
	 * timestamp covers it).
	 */
	hasPendingCheckIn: boolean;
}

/**
 * Sort order for the list endpoint. Default `newest_first` (createdAt DESC) reflects how
 * the user thinks about their inbox: most recent first. `deadline_soonest` surfaces
 * customer-deadline-imminent rows first (NULL deadlines sort last). `urgency` sorts by
 * the extractor's urgency enum, EMERGENCY first.
 */
export const OPPORTUNITY_SORTS = ['newest_first', 'deadline_soonest', 'urgency'] as const;
export type OpportunitySort = (typeof OPPORTUNITY_SORTS)[number];

/** Per-status row counts for the org. Drives the segmented filter tabs. */
export interface OpportunityStatusCounts {
	new: number;
	replied: number;
	waiting: number;
	cold: number;
	won: number;
	lost: number;
}

export interface OpportunityList {
	opportunities: Opportunity[];
	/** Opaque cursor for the next page. `null` when this is the last page. */
	nextCursor: string | null;
	/**
	 * Totals across the WHOLE org (not just the filtered/paged subset).  — dismissed
	 * rows are excluded from every bucket so the tab counts stay honest as a workflow funnel.
	 */
	statusCounts: OpportunityStatusCounts;
}

/**
 * Server-side filter for whether the list includes dismissed rows.
 *   - `active` (default): only rows where `dismissedAt IS NULL`.
 *   - `dismissed`: only rows where `dismissedAt IS NOT NULL`.
 *   - `all`: no filter on `dismissedAt`.
 */
export const OPPORTUNITY_DISMISSED_FILTERS = ['active', 'dismissed', 'all'] as const;
export type OpportunityDismissedFilter = (typeof OPPORTUNITY_DISMISSED_FILTERS)[number];

export interface ListOpportunitiesQuery {
	cursor?: string;
	limit?: number;
	status?: OpportunityStatus;
	sort?: OpportunitySort;
	search?: string;
	dismissed?: OpportunityDismissedFilter;
}

export interface UpdateOpportunityStatusInput {
	status: OpportunityStatus;
}

/**
 * Partial-update payload for `PATCH /api/opportunities/:id`. Every field is optional;
 * omitting a key leaves it untouched (no "clear by absence" semantics — null is the
 * explicit "clear" value for the nullable fields). Server validates each field
 * independently + audit-logs each changed value for the year-2 extractor-improvement
 * loop ("which fields are owners correcting most often?").
 */
export interface UpdateOpportunityFieldsInput {
	urgency?: OpportunityUrgency;
	/** Free text. `null` clears the field. Trimmed server-side; max 500 chars. */
	address?: string | null;
	/** ISO date (YYYY-MM-DD) or null to clear. Stored as DateTime at midnight UTC. */
	customerDeadline?: string | null;
	/** Same shape as `customerDeadline`. Conceptually distinct : deadline = when
	 * the customer wants the work done; appointment = when they want to meet. */
	customerAppointment?: string | null;
}

/**
 * Detail-view shape for `GET /api/opportunities/:id`. Extends the list-row
 * `Opportunity` with:
 *  - `originalEmailBody` — plain-text rendering of the customer's email body (HTML
 *    stripped + whitespace normalised via the same `buildRawMessageAIInput` helper the
 *    AI pipeline uses). The detail panel renders it as preformatted text.
 *  - `replyDraft` — the AI-generated reply draft, or `null` if the generation
 *    hasn't completed yet (the FE polls or surfaces a "draft is being prepared" state
 *    when null).
 */
export interface OpportunityDetail extends Opportunity {
	originalEmailBody: string;
	replyDraft: ReplyDraft | null;
	/**
	 * Prior drafts for this opportunity, newest-first. Includes the current
	 * draft if it's SENT (so the user sees their just-sent reply in history
	 * immediately, not only after composing a follow-up). Excludes the current draft
	 * when it's still in-progress (PENDING_APPROVAL / EDITED) — that lives in
	 * `replyDraft` above. Empty array when only one draft has ever existed and it's
	 * still being edited.
	 */
	replyDraftHistory: ReplyDraft[];
	/**
	 *  follow-up — inbound customer replies on this opportunity's thread (linked
	 * via `RawMessage.opportunityId` to this opp). Newest-first. Empty when no
	 * customer reply has landed yet. Rendered alongside `replyDraftHistory` as part
	 * of the conversational timeline; the FE merges + sorts by timestamp to produce
	 * a chronological "you sent → klant replied → you sent → …" view.
	 */
	customerReplies: CustomerReplyEntry[];
	/**
	 * System + owner activity events for the opportunity (status changes, dismiss /
	 * undismiss, auto-cold flips). Newest-first. Sourced from the `Log` table — anything
	 * not in {@link OPPORTUNITY_TIMELINE_EVENT_KINDS} is excluded server-side. Rendered
	 * by the detail-view timeline panel interleaved with drafts + customer replies.
	 */
	timeline: OpportunityTimelineEvent[];
}

export const OPPORTUNITY_TIMELINE_EVENT_KINDS = [
	'status_changed',
	'auto_cold',
	'dismissed',
	'undismissed',
	'fields_updated'
] as const;
export type OpportunityTimelineEventKind = (typeof OPPORTUNITY_TIMELINE_EVENT_KINDS)[number];

/**
 * Per-field change captured on an `opportunity.fields_updated` log. The wire format
 * carries the discriminator + typed before/after for each editable field. Unknown
 * fields are dropped server-side so the FE only sees ones it knows how to render.
 */
export type OpportunityFieldChange =
	| { field: 'urgency'; before: OpportunityUrgency | null; after: OpportunityUrgency | null }
	| { field: 'address'; before: string | null; after: string | null }
	| { field: 'customerDeadline'; before: string | null; after: string | null }
	| { field: 'customerAppointment'; before: string | null; after: string | null };

interface OpportunityTimelineEventBase {
	id: string;
	occurredAt: string;
	actorUserId: string | null;
	/** Display name of the actor (User.name with email fallback). `null` for
	 * system-driven events (auto-cold) or rows whose actor user has since been
	 * deleted. */
	actorName: string | null;
}

export interface OpportunityStatusChangedEvent extends OpportunityTimelineEventBase {
	kind: 'status_changed';
	previousStatus: OpportunityStatus | null;
	nextStatus: OpportunityStatus;
}

export interface OpportunityAutoColdEvent extends OpportunityTimelineEventBase {
	kind: 'auto_cold';
	daysSinceSent: number;
	coldAfterDays: number;
}

export interface OpportunityDismissedEvent extends OpportunityTimelineEventBase {
	kind: 'dismissed';
	reason: OpportunityDismissReason;
	previousReason: OpportunityDismissReason | null;
	previousStatus: OpportunityStatus | null;
	notes: string | null;
}

export interface OpportunityUndismissedEvent extends OpportunityTimelineEventBase {
	kind: 'undismissed';
	previousReason: OpportunityDismissReason | null;
}

export interface OpportunityFieldsUpdatedEvent extends OpportunityTimelineEventBase {
	kind: 'fields_updated';
	changes: OpportunityFieldChange[];
}

export type OpportunityTimelineEvent =
	| OpportunityStatusChangedEvent
	| OpportunityAutoColdEvent
	| OpportunityDismissedEvent
	| OpportunityUndismissedEvent
	| OpportunityFieldsUpdatedEvent;

/**
 * Inbound message from the customer attached to an opportunity's thread. Shown in
 * the detail-view timeline so the owner can see the back-and-forth without leaving
 * Quoteom. Body is the plain-text rendering of the provider payload (HTML stripped
 * + whitespace normalized via `buildRawMessageAIInput`).
 */
export interface CustomerReplyEntry {
	id: string;
	fromName: string | null;
	fromEmail: string | null;
	receivedAt: string;
	body: string;
	/**
	 * `true` when the should-reply classifier marked this message as a conversation
	 * closer ("Bedankt, tot dan!", "Akkoord", thumbs-up acknowledgment). Quoteom
	 * deliberately did NOT generate a follow-up draft for it. UI surfaces this with
	 * a small chip so the owner knows the absence-of-draft is intentional, not a bug.
	 */
	wasDetectedAsCloser: boolean;
}

/**
 * Payload for `PATCH /api/opportunities/:id/dismiss`. `notes` is optional
 * free-text the owner can attach when the reason is `other` (or any reason); stored
 * only in the audit log (`LogService.logAction` metadata), not on the row itself.
 */
export interface DismissOpportunityInput {
	reason: OpportunityDismissReason;
	notes?: string;
}

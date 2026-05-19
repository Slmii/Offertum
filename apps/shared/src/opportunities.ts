import type { ReplyDraft } from './reply-drafts.js';

export const OPPORTUNITY_STATUSES = ['new', 'replied', 'waiting', 'cold', 'won', 'lost'] as const;

export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export type OpportunityUrgency = 'emergency' | 'high' | 'normal' | 'low';

/**
 * W4.6 — Reason an opportunity was dismissed by the owner. Distinct axis from
 * `OpportunityStatus` per D28 — `lost` means "real quote we didn't win," not
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
	 * W5.5 follow-up — ISO timestamp the reply draft was sent at via Quoteom, or `null`
	 * when no reply has been sent (no draft yet, or draft is still pending / edited).
	 * Surfaces on the LIST shape so the dismiss dialog can warn "you already replied;
	 * dismissing won't unsend the email" without an extra detail-view fetch. Distinct
	 * from `Opportunity.status === 'replied'` because the user can manually move an opp
	 * to `replied` without sending via Quoteom, and the dismiss-warning copy specifically
	 * mentions the SENT email — keep the two signals decoupled.
	 */
	replyDraftSentAt: string | null;
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
	 * Totals across the WHOLE org (not just the filtered/paged subset). W4.6 — dismissed
	 * rows are excluded from every bucket so the tab counts stay honest as a workflow funnel.
	 */
	statusCounts: OpportunityStatusCounts;
}

/**
 * W4.6 — Server-side filter for whether the list includes dismissed rows.
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
 * W5.4 — Detail-view shape for `GET /api/opportunities/:id`. Extends the list-row
 * `Opportunity` with:
 *  - `originalEmailBody` — plain-text rendering of the customer's email body (HTML
 *    stripped + whitespace normalised via the same `buildRawMessageAIInput` helper the
 *    AI pipeline uses). The detail panel renders it as preformatted text.
 *  - `replyDraft` — the AI-generated reply draft, or `null` if the W5.3 generation
 *    hasn't completed yet (the FE polls or surfaces a "draft is being prepared" state
 *    when null).
 */
export interface OpportunityDetail extends Opportunity {
	originalEmailBody: string;
	replyDraft: ReplyDraft | null;
}

/**
 * W4.6 — Payload for `PATCH /api/opportunities/:id/dismiss`. `notes` is optional
 * free-text the owner can attach when the reason is `other` (or any reason); stored
 * only in the audit log (`LogService.logAction` metadata), not on the row itself.
 */
export interface DismissOpportunityInput {
	reason: OpportunityDismissReason;
	notes?: string;
}

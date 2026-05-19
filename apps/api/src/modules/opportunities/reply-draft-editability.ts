import {
	OpportunityStatus as PrismaOpportunityStatus,
	ReplyDraftStatus as PrismaReplyDraftStatus
} from '@/generated/prisma/enums';

/**
 * Opportunity statuses that lock the reply draft. Picked deliberately:
 *  - REPLIED: a reply went out (either via Quoteom — which also flips draft.status to
 *    SENT — or the user marked it manually after a phone callback).
 *  - WON / LOST: workflow-terminal. The deal is settled; no more draft work belongs
 *    here. The status-transition policy doesn't permit moving OUT of WON/LOST, so this
 *    is a permanent lock at the workflow layer.
 *
 * NEW / WAITING / COLD stay editable — these are in-progress states where the owner
 * might still want to refine the draft or stage a follow-up.
 */
export const TERMINAL_OPPORTUNITY_STATUSES_FOR_DRAFT: ReadonlySet<PrismaOpportunityStatus> = new Set([
	PrismaOpportunityStatus.REPLIED,
	PrismaOpportunityStatus.WON,
	PrismaOpportunityStatus.LOST
]);

export interface ReplyDraftEditabilityInput {
	opportunityStatus: PrismaOpportunityStatus;
	/** `null` when no draft has been generated yet — never locks (caller decides). */
	draftStatus: PrismaReplyDraftStatus | null;
}

/**
 * Single source of truth for "is the draft editable right now?" — drives the autosave
 * endpoint, the regenerate endpoint, and the attachments endpoints.
 *
 * Two independent legs combined with OR:
 *  1. **Draft has been sent** — permanent. Even if the user reverts the opportunity
 *     to WAITING / COLD, a sent email can't be un-sent and the draft stays read-only.
 *  2. **Opportunity is in a terminal-for-draft state** — reversible. Move from WON
 *     back to WAITING (transition policy doesn't permit this today, but the leg is
 *     order-independent for future-proofing) and the draft re-opens, provided it
 *     was never actually sent.
 *
 * The reverse implication ("draft is editable") needs BOTH legs to clear; the OR on
 * the locked side is the same as AND on the editable side.
 */
export function isReplyDraftEditable(input: ReplyDraftEditabilityInput): boolean {
	if (input.draftStatus === PrismaReplyDraftStatus.SENT) {
		return false;
	}
	if (TERMINAL_OPPORTUNITY_STATUSES_FOR_DRAFT.has(input.opportunityStatus)) {
		return false;
	}
	return true;
}

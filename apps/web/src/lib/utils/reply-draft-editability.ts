import type { OpportunityStatus, ReplyDraftStatus } from '@quoteom/shared';

/**
 * Web mirror of the API helper in
 * `apps/api/src/modules/opportunities/reply-draft-editability.ts`. Two helpers in two
 * apps because the wire-format and Prisma enums differ casing-wise, and DRY at this
 * boundary means importing Prisma enums into the web bundle (which we don't want).
 *
 * Keep the two in lockstep: any future change to the lock rule needs the same change
 * here. The set of terminal opportunity statuses is the canonical contract.
 */
const TERMINAL_OPPORTUNITY_STATUSES_FOR_DRAFT: ReadonlySet<OpportunityStatus> = new Set(['replied', 'won', 'lost']);

export interface ReplyDraftEditabilityInput {
	opportunityStatus: OpportunityStatus;
	draftStatus: ReplyDraftStatus | null;
}

export function isReplyDraftEditable(input: ReplyDraftEditabilityInput): boolean {
	if (input.draftStatus === 'sent') {
		return false;
	}
	if (TERMINAL_OPPORTUNITY_STATUSES_FOR_DRAFT.has(input.opportunityStatus)) {
		return false;
	}
	return true;
}

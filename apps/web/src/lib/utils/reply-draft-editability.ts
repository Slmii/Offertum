import type { ReplyDraftStatus } from '@quoteom/shared';

/**
 * Web mirror of the API helper in
 * `apps/api/src/modules/opportunities/reply-draft-editability.ts`. Two helpers in two
 * apps because the wire-format and Prisma enums differ casing-wise. Keep them in
 * lockstep.
 *
 * Lock collapses to a single rule: the latest draft's status. `sent` is the only
 * lock (permanent). Opp.status is informational and does not affect editability —
 * see the API helper's docblock for the W5.6-followup reasoning.
 */
export interface ReplyDraftEditabilityInput {
	draftStatus: ReplyDraftStatus | null;
}

export function isReplyDraftEditable(input: ReplyDraftEditabilityInput): boolean {
	return input.draftStatus !== 'sent';
}

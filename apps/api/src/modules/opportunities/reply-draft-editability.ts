import { ReplyDraftStatus as PrismaReplyDraftStatus } from '@/generated/prisma/enums';

export interface ReplyDraftEditabilityInput {
	/** `null` when no draft has been generated yet — never locks (caller decides). */
	draftStatus: PrismaReplyDraftStatus | null;
}

/**
 * Single source of truth for "is the draft editable right now?" — drives the autosave
 * endpoint, the regenerate endpoint, and the attachments endpoints.
 * **One lock, one rule:** the latest draft's status. `SENT` is permanent ("can't
 * unsend an email"); anything else is editable.
 * Previously this rule also locked when the opportunity was in a
 * terminal workflow state (REPLIED/WON/LOST). That second leg was a workaround for
 * the 1:1 era when each opp had exactly one draft, and we needed an extra signal to
 * say "this opp is done." With 1:N drafts , the latest draft's `status` is
 * fully expressive on its own: a PENDING_APPROVAL / EDITED draft means "we're
 * working on a reply right now," regardless of the opp's workflow status. Keeping
 * the opp-status leg caused real bugs (a follow-up on a WON deal would force the
 * workflow status to REPLIED), so it was dropped.
 * Opp.status is now strictly informational from this gate's perspective — owners
 * can mark a deal won / lost / cold for their pipeline tracking without that
 * affecting their ability to compose a courtesy follow-up.
 */
export function isReplyDraftEditable(input: ReplyDraftEditabilityInput): boolean {
	return input.draftStatus !== PrismaReplyDraftStatus.SENT;
}

/**
 * Wire-format types for the W5.3 reply-draft surface.
 *
 * Drafts are 1:1 with `Opportunity` (`opportunityId` is unique in the schema). The AI
 * generates the draft after `Opportunity.status = NEW` is persisted (Inngest function
 * `reply-draft-generate`), so by the time the owner opens the W5.4 detail view the body
 * is ready. `originalBody` is the pristine AI output; `body` is the current state (the
 * user may have edited it). On send (W5.5) the server diffs the two to drive the W5.7
 * edit-driven tone-playbook update.
 */

export const REPLY_DRAFT_STATUSES = ['pending_approval', 'edited', 'sent'] as const;
export type ReplyDraftStatus = (typeof REPLY_DRAFT_STATUSES)[number];

export interface ReplyDraft {
	id: string;
	opportunityId: string;
	originalBody: string;
	body: string;
	status: ReplyDraftStatus;
	wasEditedByUser: boolean;
	aiCallId: string | null;
	sentAt: string | null;
	createdAt: string;
	updatedAt: string;
	/**
	 * W5.4 — ISO timestamp when the *body* was last AI-generated. Sourced from the
	 * linked `AICall.createdAt` so it advances on every regenerate (unlike `createdAt`,
	 * which is fixed at row insert and never changes). Used by the editor banner's
	 * "your writing style is newer than this draft" comparison. `null` only when the
	 * AICall persist failed at the moment of (re)generation — caller falls back to
	 * `createdAt` in that case.
	 */
	aiBodyGeneratedAt: string | null;
	/**
	 * W5.5 follow-up — attachments staged on this draft. Empty array (never `null`)
	 * when none are attached so the UI doesn't branch on presence. Ordered by upload
	 * time ascending so the order is stable across re-renders.
	 */
	attachments: ReplyDraftAttachment[];
}

/**
 * W5.5 follow-up — metadata for a file attached to a reply draft. Binary is fetched
 * separately via `GET /api/opportunities/:id/reply-draft/attachments/:attachmentId/download`
 * — keeping it out of the JSON payload means a 5 MB PDF doesn't bloat every detail-view
 * load.
 */
export interface ReplyDraftAttachment {
	id: string;
	replyDraftId: string;
	filename: string;
	contentType: string;
	sizeBytes: number;
	createdAt: string;
}

/**
 * Request body for `PATCH /api/opportunities/:id/reply-draft`. Autosaved from the W5.4
 * editor on debounced typing. The server flips `wasEditedByUser = true` on first
 * non-no-op write + bumps `status` to `EDITED`.
 */
export interface UpdateReplyDraftInput {
	body: string;
}

/**
 * Max length of the draft body. Generous on purpose — covers a fully-edited multi-
 * paragraph quote PDF cover note without truncation. Capped server-side to stop a
 * runaway client from blowing up Postgres TEXT.
 */
export const REPLY_DRAFT_BODY_MAX_LENGTH = 16_000;

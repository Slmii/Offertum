/**
 * Wire-format types for `GET /api/me/tone-playbook` and `PUT /api/me/tone-playbook`.
 *
 * Per D31, the tone playbook is owner-authored free-form Dutch prose injected verbatim
 * into the W5.3 reply-draft prompt. Null = use the generic Dutch baseline. Owner-only
 * (`@OwnerWrite()`) because writing-style affects every team member's drafts.
 */

export interface TonePlaybook {
	text: string | null;
	/** ISO timestamp of the org's `updatedAt` (proxy for "when did the playbook last change"). */
	updatedAt: string;
}

export interface UpdateTonePlaybookInput {
	/** Empty string clears the playbook (back to generic baseline). */
	text: string;
}

/** Capped at 4kB on the server. Prose, not a novel — owners who want more should split jobs. */
export const TONE_PLAYBOOK_MAX_LENGTH = 4000;

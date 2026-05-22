/**
 * Wire-format types for `GET /api/me/tone-playbook` and `PUT /api/me/tone-playbook`.
 * The the tone playbook is owner-authored free-form Dutch prose injected verbatim
 * into the reply-draft prompt. Null = use the generic Dutch baseline. Owner-only
 * (`@OwnerWrite`) because writing-style affects every team member's drafts.
 */

export interface TonePlaybook {
	text: string | null;
	/**
	 * ISO timestamp when the playbook was last saved. `null` when the user has never
	 * authored one — distinct from `User.updatedAt` so unrelated User-row writes don't
	 * trigger the "your writing style was updated since this draft was generated"
	 * banner.
	 */
	updatedAt: string | null;
}

export interface UpdateTonePlaybookInput {
	/** Empty string clears the playbook (back to generic baseline). */
	text: string;
}

/** Capped at 4kB on the server. Prose, not a novel — owners who want more should split jobs. */
export const TONE_PLAYBOOK_MAX_LENGTH = 4000;

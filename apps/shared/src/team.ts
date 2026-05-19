/**
 * Mirrors Prisma's `MembershipRole` enum. Declared as a string union here (not re-exported
 * from Prisma) because Prisma's generated client lives inside `apps/api` and shouldn't
 * leak into `@quoteom/shared` — that would pull the Prisma runtime into the web bundle.
 */
export type MembershipRole = 'OWNER' | 'MEMBER' | 'EXTERNAL';

/** Minimal user shape included in membership responses (no PII beyond what the UI needs). */
export interface MembershipUser {
	id: string;
	email: string;
	name: string | null;
	isAdmin: boolean;
	/**
	 * W5.2 — Whether this user has authored a writing-style playbook
	 * (`User.tonePlaybookText`). Boolean flag instead of the text itself: avoids leaking
	 * the playbook into every authenticated page load while still letting the FE render
	 * the just-in-time "Vertel ons hoe je schrijft" banner in the W5.4 draft editor.
	 * Per-user (not per-org) per D31 — voice belongs to the person.
	 */
	hasTonePlaybook: boolean;
	/**
	 * W5.4 — ISO timestamp the playbook was last updated. `null` when the user has
	 * never authored one. Used by the detail editor's "your writing style changed,
	 * regenerate?" banner — compared against `replyDraft.createdAt`. Approximated as
	 * `User.updatedAt` server-side (other User-row updates can shift it; acceptable
	 * MVP noise — a name change firing this banner once is a tiny edge case).
	 */
	tonePlaybookUpdatedAt: string | null;
}

/** Minimal organization shape included in membership responses. */
export interface MembershipOrganization {
	id: string;
	name: string;
}

/** `GET /api/me/memberships` row + `GET /api/me/membership` + the org switcher's `GET /api/me/organizations`. */
export interface Membership {
	id: string;
	userId: string;
	organizationId: string;
	role: MembershipRole;
	/** ISO timestamp (wire format). */
	createdAt: string;
	/** ISO timestamp (wire format). */
	updatedAt: string;
	user: MembershipUser;
	organization: MembershipOrganization;
}

/** `POST /api/me/switch-organization` request body. */
export interface SwitchOrganizationInput {
	organizationId: string;
}

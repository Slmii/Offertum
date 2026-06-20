import {
	OPPORTUNITY_ASSIGNEE_FILTERS,
	OPPORTUNITY_DEADLINE_FILTERS,
	OPPORTUNITY_DISMISSED_FILTERS,
	OPPORTUNITY_MAILBOX_OWNERSHIP_FILTERS,
	OPPORTUNITY_SORTS,
	OPPORTUNITY_STATUSES,
	OPPORTUNITY_URGENCIES,
	type OpportunityAssigneeFilter,
	type OpportunityDeadlineFilter,
	type OpportunityDismissedFilter,
	type OpportunityMailboxOwnershipFilter,
	type OpportunitySort,
	type OpportunityStatus,
	type OpportunityUrgency
} from '@offertum/shared';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

// Query params arrive as strings; treat the literal "true" as boolean true, everything else false.
const toBool = ({ value }: { value: unknown }) => value === true || value === 'true';

/**
 * Query params for `GET /api/opportunities`.
 * - `cursor`: opaque base64url cursor from a prior page's `nextCursor`.
 * - `limit`: server-clamped to [1, 100], default 25.
 * - `status`: optional filter on `OpportunityStatus`. Cursor pagination respects it.
 * - `sort`: optional ordering. Cursor pagination is only stable when paired with the
 *   matching sort field — see `OpportunityListCursor` for the keyset shape.
 */
export class ListOpportunitiesQueryDto {
	@IsOptional()
	@IsString()
	cursor?: string;

	@IsOptional()
	@Type(() => Number)
	@Transform(({ value }) => (typeof value === 'string' ? Number(value) : value))
	@IsInt()
	@Min(1)
	@Max(100)
	limit?: number;

	@IsOptional()
	@IsIn(OPPORTUNITY_STATUSES)
	status?: OpportunityStatus;

	@IsOptional()
	@IsIn(OPPORTUNITY_SORTS)
	sort?: OpportunitySort;

	/**
	 * Free-text search across `customerName`, `address`, `requestType`, `fromName`, and
	 * `subject` via case-insensitive `ILIKE`. Empty/whitespace-only is ignored. Capped
	 * server-side to 80 chars to bound the query plan (and prevent the user from
	 * accidentally pasting a 5KB email body into the box).
	 */
	@IsOptional()
	@IsString()
	@MaxLength(80)
	search?: string;

	/**
	 * Whether to include dismissed rows. Default behavior (omitted) is `active`
	 * (hide dismissed). The web "Toon afgewezen" toggle sends `dismissed`. `all`
	 * exists mostly for tests + the future admin precision panel.
	 */
	@IsOptional()
	@IsIn(OPPORTUNITY_DISMISSED_FILTERS)
	dismissed?: OpportunityDismissedFilter;

	/**
	 * Mailbox-ownership filter. `mine` → only opps where the originating mailbox is
	 * owned by the requesting user. `all` (or omitted) → every opp in the org.
	 */
	@IsOptional()
	@IsIn(OPPORTUNITY_MAILBOX_OWNERSHIP_FILTERS)
	owner?: OpportunityMailboxOwnershipFilter;

	/**
	 * Assignment filter. `me` → only opps where `assignedToUserId === currentUserId`.
	 * `unassigned` → only opps with no assignee. `all` (or omitted) → no filter.
	 */
	@IsOptional()
	@IsIn(OPPORTUNITY_ASSIGNEE_FILTERS)
	assignee?: OpportunityAssigneeFilter;

	/** `true` → only opps where the customer replied beyond the original request. */
	@IsOptional()
	@Transform(toBool)
	@IsBoolean()
	hasReplies?: boolean;

	/** Restrict to a single urgency level (emergency / high / normal / low). */
	@IsOptional()
	@IsIn(OPPORTUNITY_URGENCIES)
	urgency?: OpportunityUrgency;

	/** Deadline filter: `has` / `overdue` / `soon` (≤7 days). `all` (or omitted) → no filter. */
	@IsOptional()
	@IsIn(OPPORTUNITY_DEADLINE_FILTERS)
	deadline?: OpportunityDeadlineFilter;

	/** `true` → only opps with an auto follow-up (check-in) draft awaiting review. */
	@IsOptional()
	@Transform(toBool)
	@IsBoolean()
	pendingFollowup?: boolean;

	/** `true` → only opps with a requested appointment date set. */
	@IsOptional()
	@Transform(toBool)
	@IsBoolean()
	hasAppointment?: boolean;
}

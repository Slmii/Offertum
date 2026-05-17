export const OPPORTUNITY_STATUSES = ['new', 'replied', 'waiting', 'cold', 'won', 'lost'] as const;

export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export type OpportunityUrgency = 'emergency' | 'high' | 'normal' | 'low';

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
	/** Totals across the WHOLE org (not just the filtered/paged subset). */
	statusCounts: OpportunityStatusCounts;
}

export interface ListOpportunitiesQuery {
	cursor?: string;
	limit?: number;
	status?: OpportunityStatus;
	sort?: OpportunitySort;
}

export interface UpdateOpportunityStatusInput {
	status: OpportunityStatus;
}

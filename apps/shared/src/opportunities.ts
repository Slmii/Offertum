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

export interface OpportunityList {
	opportunities: Opportunity[];
	/** Opaque cursor for the next page. `null` when this is the last page. */
	nextCursor: string | null;
}

export interface ListOpportunitiesQuery {
	cursor?: string;
	limit?: number;
}

export interface UpdateOpportunityStatusInput {
	status: OpportunityStatus;
}

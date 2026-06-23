import type {
	Opportunity,
	OpportunityDismissReason,
	OpportunityLastActivity,
	OpportunityStatus,
	OpportunityUrgency
} from '@offertum/shared';

/**
 * Date fields are `Date` on the service side, but this DTO intentionally exposes ISO
 * strings because `@offertum/shared` describes the wire format the web app receives.
 */
export class OpportunityResponseDto implements Opportunity {
	id!: string;
	organizationId!: string;
	emailAccountId!: string;
	rawMessageId!: string;
	status!: OpportunityStatus;
	aiProvider!: string;
	requestType!: string;
	urgency!: OpportunityUrgency;
	deliverableHints!: string[];
	createdAt!: string;
	updatedAt!: string;
	internalDate!: string;
	subject!: string | null;
	fromEmail!: string | null;
	fromName!: string | null;
	threadId!: string | null;
	classifierConfidence!: number | null;
	classifierReason!: string | null;
	customerName!: string | null;
	customerEmail!: string | null;
	customerPhone!: string | null;
	address!: string | null;
	customerDeadline!: string | null;
	customerAppointment!: string | null;
	dismissedAt!: string | null;
	dismissReason!: OpportunityDismissReason | null;
	dismissedByUserId!: string | null;
	assignedToUserId!: string | null;
	assignedToName!: string | null;
	replyDraftSentAt!: string | null;
	hasPendingCheckIn!: boolean;
	checkInDraftCreatedAt!: string | null;
	lastActivity!: OpportunityLastActivity | null;
	customerReplyCount!: number;
}

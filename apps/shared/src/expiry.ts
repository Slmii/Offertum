export const EXPIRY_ACTION_KINDS = ['EXTEND_14D', 'LAST_FOLLOWUP', 'MARK_LOST'] as const;
export type ExpiryActionKindValue = (typeof EXPIRY_ACTION_KINDS)[number];

export const EXPIRY_ACTION_STATUSES = ['SUGGESTED', 'TAKEN', 'DISMISSED', 'SUPERSEDED'] as const;
export type ExpiryActionStatusValue = (typeof EXPIRY_ACTION_STATUSES)[number];

// Wire shape of the live expiry suggestion shown on the opportunity detail page.
// Dates are ISO strings on the wire (see the package convention note).
export interface ExpiryActionResponse {
	id: string;
	opportunityId: string;
	quoteDraftId: string;
	validUntil: string;
	suggestedCopy: string;
	status: ExpiryActionStatusValue;
	recommendedAction: ExpiryActionKindValue;
	takenAction: ExpiryActionKindValue | null;
}

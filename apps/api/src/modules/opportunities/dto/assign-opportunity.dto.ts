import type { AssignOpportunityInput } from '@quoteom/shared';
import { IsOptional, IsUUID, ValidateIf } from 'class-validator';

/**
 * Payload for `PATCH /api/opportunities/:id/assignee`. `userId === null` clears the
 * assignment back to "anyone". Server-side validates that the user is a member of
 * the requesting org before writing.
 */
export class AssignOpportunityDto implements AssignOpportunityInput {
	@ValidateIf((_, value) => value !== null)
	@IsOptional()
	@IsUUID()
	userId!: string | null;
}

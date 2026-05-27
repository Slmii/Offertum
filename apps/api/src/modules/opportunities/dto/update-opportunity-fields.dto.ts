import { OPPORTUNITY_URGENCIES, type OpportunityUrgency, type UpdateOpportunityFieldsInput } from '@offertum/shared';
import { IsIn, IsISO8601, IsOptional, MaxLength, ValidateIf } from 'class-validator';

/**
 * Partial-update payload for `PATCH /api/opportunities/:id`. Editable workflow-adjacent
 * fields the AI extractor produced and the owner might need to correct. Status,
 * dismiss, and reply-draft mutations have their own dedicated endpoints.
 *
 * The `ValidateIf(o => o.<key> !== null)` shim makes nullable-or-string fields
 * accept an explicit `null` (clear the field) without tripping the corresponding
 * IsString / IsISO8601 validator. `IsOptional` alone treats `null` like undefined,
 * which would silently drop a clear request.
 */
export class UpdateOpportunityFieldsDto implements UpdateOpportunityFieldsInput {
	@IsOptional()
	@IsIn(OPPORTUNITY_URGENCIES)
	urgency?: OpportunityUrgency;

	@IsOptional()
	@ValidateIf((_, value) => value !== null)
	@MaxLength(500)
	address?: string | null;

	@IsOptional()
	@ValidateIf((_, value) => value !== null)
	@IsISO8601()
	customerDeadline?: string | null;

	@IsOptional()
	@ValidateIf((_, value) => value !== null)
	@IsISO8601()
	customerAppointment?: string | null;
}

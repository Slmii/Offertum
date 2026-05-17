import { OPPORTUNITY_STATUSES, type UpdateOpportunityStatusInput } from '@quoteom/shared';
import { IsIn } from 'class-validator';

export class UpdateOpportunityStatusDto implements UpdateOpportunityStatusInput {
	@IsIn(OPPORTUNITY_STATUSES)
	status!: UpdateOpportunityStatusInput['status'];
}

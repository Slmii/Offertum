import type { OpportunityList, OpportunityStatusCounts } from '@offertum/shared';
import type { OpportunityResponseDto } from '@/modules/opportunities/dto/opportunity.response.dto';

export class OpportunityStatusCountsDto implements OpportunityStatusCounts {
	new!: number;
	replied!: number;
	waiting!: number;
	cold!: number;
	won!: number;
	lost!: number;
}

export class OpportunityListResponseDto implements OpportunityList {
	opportunities!: OpportunityResponseDto[];
	/** Opaque cursor for the next page, or `null` when this is the last page. */
	nextCursor!: string | null;
	statusCounts!: OpportunityStatusCountsDto;
}

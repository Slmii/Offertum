import type { OpportunityList } from '@quoteom/shared';
import type { OpportunityResponseDto } from '@/modules/opportunities/dto/opportunity.response.dto';

export class OpportunityListResponseDto implements OpportunityList {
	opportunities!: OpportunityResponseDto[];
	/** Opaque cursor for the next page, or `null` when this is the last page. */
	nextCursor!: string | null;
}

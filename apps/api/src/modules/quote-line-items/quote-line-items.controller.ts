import { MemberWrite } from '@/common/decorators/member-write.decorator';
import { ProposeQuoteLinesResponseDto } from '@/modules/quote-line-items/dto/proposed-quote-line.response.dto';
import { QuoteLineItemsService } from '@/modules/quote-line-items/quote-line-items.service';
import { Controller, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

/**
 * W10.1 preview surface. Runs the LLM-match / engine-price proposer against a
 * real opportunity and returns the proposed lines — no persistence yet
 * (`QuoteDraft` lands in W10.2). `@MemberWrite()` because it fires a paid AI call
 * + reads org pricing data: member-level access, billing-gated.
 */
@ApiTags('quote-line-items')
@Controller('opportunities/:opportunityId/quote-line-items')
export class QuoteLineItemsController {
	constructor(private readonly quoteLineItems: QuoteLineItemsService) {}

	@ApiOperation({ summary: 'Propose quote line items for an opportunity (catalog match + rule pricing)' })
	@ApiOkResponse({ type: ProposeQuoteLinesResponseDto })
	@MemberWrite()
	@Post('preview')
	async preview(
		@Req() request: Request,
		@Param('opportunityId', new ParseUUIDPipe()) opportunityId: string
	): Promise<ProposeQuoteLinesResponseDto> {
		const lines = await this.quoteLineItems.proposeForOpportunity(request.organizationId!, opportunityId);
		return { lines };
	}
}

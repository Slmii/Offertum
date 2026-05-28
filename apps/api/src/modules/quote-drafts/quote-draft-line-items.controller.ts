import { MemberWrite } from '@/common/decorators/member-write.decorator';
import { QuoteDraftResponseDto } from '@/modules/quote-drafts/dto/quote-draft.response.dto';
import { CreateQuoteLineItemDto, UpdateQuoteLineItemDto } from '@/modules/quote-drafts/dto/quote-line-item-input.dto';
import { QuoteDraftsService } from '@/modules/quote-drafts/quote-drafts.service';
import { Body, Controller, Delete, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

/**
 * W10.3 line-item editing. Each mutation returns the full updated draft so the
 * editor can recompute totals from one response. All `@MemberWrite()` (org pricing
 * data, billing-gated). Any edit flips the line's `wasEditedByUser` flag.
 */
@ApiTags('quote-drafts')
@Controller('quote-drafts/:quoteDraftId/line-items')
export class QuoteDraftLineItemsController {
	constructor(private readonly quoteDrafts: QuoteDraftsService) {}

	@ApiOperation({ summary: 'Add a line item to a quote draft' })
	@ApiOkResponse({ type: QuoteDraftResponseDto })
	@MemberWrite()
	@Post()
	add(
		@Req() request: Request,
		@Param('quoteDraftId', new ParseUUIDPipe()) quoteDraftId: string,
		@Body() body: CreateQuoteLineItemDto
	): Promise<QuoteDraftResponseDto> {
		return this.quoteDrafts.addLine(request.organizationId!, quoteDraftId, body);
	}

	@ApiOperation({ summary: 'Update a quote-draft line item' })
	@ApiOkResponse({ type: QuoteDraftResponseDto })
	@MemberWrite()
	@Patch(':lineItemId')
	update(
		@Req() request: Request,
		@Param('quoteDraftId', new ParseUUIDPipe()) quoteDraftId: string,
		@Param('lineItemId', new ParseUUIDPipe()) lineItemId: string,
		@Body() body: UpdateQuoteLineItemDto
	): Promise<QuoteDraftResponseDto> {
		return this.quoteDrafts.updateLine(request.organizationId!, quoteDraftId, lineItemId, body);
	}

	@ApiOperation({ summary: 'Delete a quote-draft line item' })
	@ApiOkResponse({ type: QuoteDraftResponseDto })
	@MemberWrite()
	@Delete(':lineItemId')
	remove(
		@Req() request: Request,
		@Param('quoteDraftId', new ParseUUIDPipe()) quoteDraftId: string,
		@Param('lineItemId', new ParseUUIDPipe()) lineItemId: string
	): Promise<QuoteDraftResponseDto> {
		return this.quoteDrafts.deleteLine(request.organizationId!, quoteDraftId, lineItemId);
	}
}

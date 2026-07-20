import { MemberWrite } from '@/common/decorators/member-write.decorator';
import { OrganizationGuard } from '@/common/guards/organization.guard';
import { NOT_AUTHENTICATED } from '@/lib/errors';
import { QuoteDraftListResponseDto, QuoteDraftResponseDto } from '@/modules/quote-drafts/dto/quote-draft.response.dto';
import { SetQuoteDiscountDto } from '@/modules/quote-drafts/dto/set-quote-discount.dto';
import { QuoteDraftsService } from '@/modules/quote-drafts/quote-drafts.service';
import {
	Body,
	Controller,
	Get,
	Param,
	ParseUUIDPipe,
	Patch,
	Post,
	Req,
	UnauthorizedException,
	UseGuards
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

/**
 * W10.2 quote-draft persistence surface.
 *  - POST persists a freshly generated proposal as a `QuoteDraft` (paid AI call +
 *    org pricing data → `@MemberWrite()`), writing a `quote.created` timeline event.
 *  - GET lists the opportunity's persisted drafts (read → `OrganizationGuard`).
 */
@ApiTags('quote-drafts')
@Controller('opportunities/:opportunityId/quote-drafts')
export class QuoteDraftsController {
	constructor(private readonly quoteDrafts: QuoteDraftsService) {}

	@ApiOperation({ summary: 'Generate and persist a quote draft for an opportunity' })
	@ApiOkResponse({ type: QuoteDraftResponseDto })
	@MemberWrite()
	@Post()
	create(
		@Req() request: Request,
		@Param('opportunityId', new ParseUUIDPipe()) opportunityId: string
	): Promise<QuoteDraftResponseDto> {
		return this.quoteDrafts.createForOpportunity(request.organizationId!, opportunityId, requireUserId(request));
	}

	@ApiOperation({ summary: 'List persisted quote drafts for an opportunity' })
	@ApiOkResponse({ type: QuoteDraftListResponseDto })
	@UseGuards(OrganizationGuard)
	@Get()
	list(
		@Req() request: Request,
		@Param('opportunityId', new ParseUUIDPipe()) opportunityId: string
	): Promise<QuoteDraftListResponseDto> {
		return this.quoteDrafts.listForOpportunity(request.organizationId!, opportunityId);
	}

	@ApiOperation({ summary: 'Set or clear the quote-level discount' })
	@ApiOkResponse({ type: QuoteDraftResponseDto })
	@MemberWrite()
	@Patch(':quoteDraftId/discount')
	setDiscount(
		@Req() request: Request,
		@Param('opportunityId', new ParseUUIDPipe()) opportunityId: string,
		@Param('quoteDraftId', new ParseUUIDPipe()) quoteDraftId: string,
		@Body() body: SetQuoteDiscountDto
	): Promise<QuoteDraftResponseDto> {
		return this.quoteDrafts.setDiscount(request.organizationId!, opportunityId, quoteDraftId, body);
	}
}

function requireUserId(request: Request): string {
	const userId = request.authSession?.user?.id;
	if (!userId) {
		throw new UnauthorizedException(NOT_AUTHENTICATED);
	}
	return userId;
}

import { MemberWrite } from '@/common/decorators/member-write.decorator';
import { QuotePdfResponseDto } from '@/modules/quote-pdfs/dto/quote-pdf.response.dto';
import { QuoteDraftsService } from '@/modules/quote-drafts/quote-drafts.service';
import { Controller, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

/**
 * W10.4 — render the quote draft as a PDF and save it as a version in the
 * opportunity's PDF history (not auto-attached; the owner picks which version to attach
 * to the reply). `@MemberWrite()`: org pricing data + billing-gated.
 */
@ApiTags('quote-drafts')
@Controller('quote-drafts/:quoteDraftId/pdf')
export class QuoteDraftPdfController {
	constructor(private readonly quoteDrafts: QuoteDraftsService) {}

	@ApiOperation({ summary: 'Generate a PDF version for the quote draft' })
	@ApiOkResponse({ type: QuotePdfResponseDto })
	@MemberWrite()
	@Post()
	generate(
		@Req() request: Request,
		@Param('quoteDraftId', new ParseUUIDPipe()) quoteDraftId: string
	): Promise<QuotePdfResponseDto> {
		return this.quoteDrafts.generatePdfVersion(request.organizationId!, quoteDraftId);
	}
}

import { MemberWrite } from '@/common/decorators/member-write.decorator';
import { OrganizationGuard } from '@/common/guards/organization.guard';
import { PreviewQuotePdfDto } from '@/modules/quote-pdfs/dto/preview-quote-pdf.dto';
import { QuotePdfsService } from '@/modules/quote-pdfs/quote-pdfs.service';
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

@ApiTags('quote-pdfs')
@Controller('quote-pdfs')
export class QuotePdfsController {
	constructor(private readonly quotePdfs: QuotePdfsService) {}

	@ApiOperation({ summary: 'Render a quote PDF preview for the active organization' })
	@ApiBody({ type: PreviewQuotePdfDto })
	@ApiProduces('application/pdf')
	@ApiOkResponse({
		description: 'PDF preview bytes',
		content: {
			'application/pdf': {
				schema: { type: 'string', format: 'binary' }
			}
		}
	})
	@MemberWrite()
	@Post('preview')
	async preview(@Req() request: Request, @Body() body: PreviewQuotePdfDto, @Res() response: Response): Promise<void> {
		const pdf = await this.quotePdfs.preview(request.organizationId!, body);
		// NON-passthrough `@Res` + `response.end(buffer)` — same pattern as the
		// logo/letterhead binary endpoints. Returning a Buffer through Nest's normal
		// pipeline (passthrough:true) would JSON-serialize it to
		// `{"type":"Buffer","data":[…]}`, which browsers can't render as a PDF.
		response.setHeader('Content-Type', 'application/pdf');
		response.setHeader('Content-Disposition', 'inline; filename="offerte-preview.pdf"');
		response.setHeader('Content-Length', String(pdf.byteLength));
		response.end(pdf);
	}

	@ApiOperation({ summary: 'Download a generated quote PDF version' })
	@ApiProduces('application/pdf')
	@ApiOkResponse({
		description: 'PDF bytes',
		content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } }
	})
	@UseGuards(OrganizationGuard)
	@Get(':quotePdfId/download')
	async download(
		@Req() request: Request,
		@Param('quotePdfId', new ParseUUIDPipe()) quotePdfId: string,
		@Res() response: Response
	): Promise<void> {
		const { filename, contentType, data } = await this.quotePdfs.getDownload(request.organizationId!, quotePdfId);
		response.setHeader('Content-Type', contentType);
		response.setHeader('Content-Disposition', `inline; filename="${filename}"`);
		response.setHeader('Content-Length', String(data.byteLength));
		response.end(data);
	}
}

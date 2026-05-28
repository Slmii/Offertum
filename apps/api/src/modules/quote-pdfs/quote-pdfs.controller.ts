import { MemberWrite } from '@/common/decorators/member-write.decorator';
import { PreviewQuotePdfDto } from '@/modules/quote-pdfs/dto/preview-quote-pdf.dto';
import { QuotePdfsService } from '@/modules/quote-pdfs/quote-pdfs.service';
import { Body, Controller, Header, Post, Req, Res } from '@nestjs/common';
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
	@Header('Content-Type', 'application/pdf')
	@Header('Content-Disposition', 'inline; filename="offerte-preview.pdf"')
	async preview(
		@Req() request: Request,
		@Body() body: PreviewQuotePdfDto,
		@Res({ passthrough: true }) response: Response
	): Promise<Buffer> {
		const pdf = await this.quotePdfs.preview(request.organizationId!, body);
		response.setHeader('Content-Length', pdf.byteLength.toString());
		return pdf;
	}
}

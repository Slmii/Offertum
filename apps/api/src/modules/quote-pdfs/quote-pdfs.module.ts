import { QuotePdfRendererService } from '@/modules/quote-pdfs/quote-pdf-renderer.service';
import { QuotePdfsController } from '@/modules/quote-pdfs/quote-pdfs.controller';
import { QuotePdfsRepository } from '@/modules/quote-pdfs/quote-pdfs.repository';
import { QuotePdfsService } from '@/modules/quote-pdfs/quote-pdfs.service';
import { Module } from '@nestjs/common';

@Module({
	controllers: [QuotePdfsController],
	providers: [QuotePdfsService, QuotePdfRendererService, QuotePdfsRepository],
	exports: [QuotePdfsService, QuotePdfRendererService, QuotePdfsRepository]
})
export class QuotePdfsModule {}

import { QuotePdfRendererService } from '@/modules/quote-pdfs/quote-pdf-renderer.service';
import { QuotePdfsController } from '@/modules/quote-pdfs/quote-pdfs.controller';
import { QuotePdfsService } from '@/modules/quote-pdfs/quote-pdfs.service';
import { Module } from '@nestjs/common';

@Module({
	controllers: [QuotePdfsController],
	providers: [QuotePdfsService, QuotePdfRendererService],
	exports: [QuotePdfsService, QuotePdfRendererService]
})
export class QuotePdfsModule {}

import { AttachmentTextExtractor } from '@/lib/attachments/attachment-text-extractor';
import { EmailAccountsModule } from '@/modules/email-accounts/email-accounts.module';
import { GmailModule } from '@/modules/gmail/gmail.module';
import { InboundAttachmentsService } from '@/modules/inbound-attachments/inbound-attachments.service';
import { MicrosoftModule } from '@/modules/microsoft/microsoft.module';
import { Module } from '@nestjs/common';

@Module({
	imports: [EmailAccountsModule, GmailModule, MicrosoftModule],
	providers: [InboundAttachmentsService, AttachmentTextExtractor],
	exports: [InboundAttachmentsService]
})
export class InboundAttachmentsModule {}

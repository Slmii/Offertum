import { QuotePdfsModule } from '@/modules/quote-pdfs/quote-pdfs.module';
import { ReplyDraftAttachmentsRepository } from '@/modules/reply-draft-attachments/reply-draft-attachments.repository';
import { ReplyDraftAttachmentsService } from '@/modules/reply-draft-attachments/reply-draft-attachments.service';
import { Module } from '@nestjs/common';

/**
 *  follow-up — attachments for reply drafts. Doesn't declare its own controller;
 * the existing `OpportunitiesController` mounts the `POST/GET/DELETE` endpoints under
 * `/api/opportunities/:id/reply-draft/attachments/*` so the URL space stays cohesive.
 * `AttachmentStorageModule` is `@Global` (registered in `AppModule`), so we don't need
 * to re-import it here.
 */
@Module({
	imports: [QuotePdfsModule],
	providers: [ReplyDraftAttachmentsService, ReplyDraftAttachmentsRepository],
	exports: [ReplyDraftAttachmentsService, ReplyDraftAttachmentsRepository]
})
export class ReplyDraftAttachmentsModule {}

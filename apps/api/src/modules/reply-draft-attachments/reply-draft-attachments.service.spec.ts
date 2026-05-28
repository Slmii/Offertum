import type { AttachmentStorage } from '@/lib/storage/attachment-storage.interface';
import type { LogService } from '@/modules/logger/log.service';
import type { ReplyDraftAttachmentsRepository } from '@/modules/reply-draft-attachments/reply-draft-attachments.repository';
import { ReplyDraftAttachmentsService } from '@/modules/reply-draft-attachments/reply-draft-attachments.service';
import { ReplyDraftStatus } from '@/generated/prisma/enums';
import { describe, expect, it, jest } from '@jest/globals';

describe('ReplyDraftAttachmentsService.upload', () => {
	it('deletes the stored blob when attachment row creation fails', async () => {
		const repository = {
			findDraftForUpload: jest.fn().mockResolvedValue({
				draftId: 'draft-1',
				opportunityId: 'opp-1',
				status: ReplyDraftStatus.PENDING_APPROVAL,
				attachmentCount: 0,
				attachmentTotalBytes: 0
			}),
			create: jest.fn().mockRejectedValue(new Error('db unavailable'))
		} as unknown as ReplyDraftAttachmentsRepository;
		const storage = {
			driver: 'local',
			put: jest.fn().mockResolvedValue({ storageKey: 'ignored' }),
			get: jest.fn(),
			delete: jest.fn().mockResolvedValue(undefined)
		} as unknown as AttachmentStorage;
		const service = new ReplyDraftAttachmentsService(repository, storage, {
			logAction: jest.fn()
		} as unknown as LogService);

		await expect(
			service.upload('org-1', 'opp-1', {
				originalname: 'brief.txt',
				mimetype: 'text/plain',
				size: 12,
				buffer: Buffer.from('hello')
			})
		).rejects.toThrow('db unavailable');

		const putCall = (storage.put as jest.Mock).mock.calls[0]?.[0] as { storageKey: string };
		expect(storage.delete).toHaveBeenCalledWith(putCall.storageKey);
	});
});

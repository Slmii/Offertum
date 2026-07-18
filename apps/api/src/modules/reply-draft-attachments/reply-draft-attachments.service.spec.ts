import { ReplyDraftStatus } from '@/generated/prisma/enums';
import type { AttachmentStorage } from '@/lib/storage/attachment-storage.interface';
import type { LogService } from '@/modules/logger/log.service';
import type { QuotePdfRow, QuotePdfsRepository } from '@/modules/quote-pdfs/quote-pdfs.repository';
import type { ReplyDraftAttachmentsRepository } from '@/modules/reply-draft-attachments/reply-draft-attachments.repository';
import { ReplyDraftAttachmentsService } from '@/modules/reply-draft-attachments/reply-draft-attachments.service';
import { describe, expect, it, jest } from '@jest/globals';

describe('ReplyDraftAttachmentsService.upload', () => {
	it('deletes the stored blob when attachment row creation fails', async () => {
		const repository = {
			findDraftForUpload: jest.fn<ReplyDraftAttachmentsRepository['findDraftForUpload']>().mockResolvedValue({
				draftId: 'draft-1',
				opportunityId: 'opp-1',
				status: ReplyDraftStatus.PENDING_APPROVAL,
				attachmentCount: 0,
				attachmentTotalBytes: 0
			}),
			create: jest.fn<ReplyDraftAttachmentsRepository['create']>().mockRejectedValue(new Error('db unavailable'))
		} as unknown as ReplyDraftAttachmentsRepository;
		const storage = {
			driver: 'local',
			put: jest.fn<AttachmentStorage['put']>().mockResolvedValue({ storageKey: 'ignored' }),
			get: jest.fn(),
			delete: jest.fn<AttachmentStorage['delete']>().mockResolvedValue(undefined)
		} as unknown as AttachmentStorage;
		const quotePdfs = {} as unknown as QuotePdfsRepository;
		const service = new ReplyDraftAttachmentsService(repository, quotePdfs, storage, {
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

describe('ReplyDraftAttachmentsService.attachQuotePdf', () => {
	function buildService(pdf: Partial<QuotePdfRow>) {
		const repository = {
			findDraftForUpload: jest.fn<ReplyDraftAttachmentsRepository['findDraftForUpload']>().mockResolvedValue({
				draftId: 'draft-1',
				opportunityId: 'opp-1',
				status: ReplyDraftStatus.PENDING_APPROVAL,
				attachmentCount: 0,
				attachmentTotalBytes: 0
			}),
			findQuotePdfAttachment: jest
				.fn<ReplyDraftAttachmentsRepository['findQuotePdfAttachment']>()
				.mockResolvedValue(null),
			create: jest.fn<ReplyDraftAttachmentsRepository['create']>().mockResolvedValue({
				id: 'attachment-1',
				replyDraftId: 'draft-1',
				filename: 'offerte.pdf',
				contentType: 'application/pdf',
				sizeBytes: 100,
				storageKey: 'draft-1/attachment-1-offerte.pdf',
				storageDriver: 'local',
				quotePdfId: 'pdf-1',
				createdAt: new Date()
			})
		} as unknown as ReplyDraftAttachmentsRepository;
		const quotePdfs = {
			findForOrganization: jest.fn<QuotePdfsRepository['findForOrganization']>().mockResolvedValue({
				id: 'pdf-1',
				organizationId: 'org-1',
				opportunityId: 'opp-1',
				quoteDraftId: 'draft-1',
				filename: 'offerte.pdf',
				quoteNumber: 'OFF-2026-0001',
				validUntil: null,
				contentType: 'application/pdf',
				sizeBytes: 100,
				totalCents: 10000,
				storageKey: 'quote-pdfs/opp-1/pdf-1-offerte.pdf',
				storageDriver: 'local',
				createdAt: new Date(),
				...pdf
			})
		} as unknown as QuotePdfsRepository;
		const storage = {
			driver: 'local',
			put: jest.fn<AttachmentStorage['put']>().mockResolvedValue({ storageKey: 'ignored' }),
			get: jest.fn<AttachmentStorage['get']>().mockResolvedValue({
				data: Buffer.from('pdf-bytes'),
				contentType: 'application/pdf'
			}),
			delete: jest.fn<AttachmentStorage['delete']>().mockResolvedValue(undefined)
		} as unknown as AttachmentStorage;
		const service = new ReplyDraftAttachmentsService(repository, quotePdfs, storage, {
			logAction: jest.fn()
		} as unknown as LogService);
		return service;
	}

	it('refuses to attach a quote PDF whose own validUntil has lapsed', async () => {
		const service = buildService({ validUntil: new Date(Date.now() - 24 * 60 * 60 * 1000) });

		await expect(service.attachQuotePdf('org-1', 'opp-1', 'pdf-1')).rejects.toThrow('Deze offerte-PDF is verlopen');
	});

	it('allows attaching a quote PDF that is still within its validUntil window', async () => {
		const service = buildService({ validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000) });

		await expect(service.attachQuotePdf('org-1', 'opp-1', 'pdf-1')).resolves.toMatchObject({
			id: 'attachment-1'
		});
	});

	it('allows attaching a legacy quote PDF with no stored validUntil', async () => {
		const service = buildService({ validUntil: null });

		await expect(service.attachQuotePdf('org-1', 'opp-1', 'pdf-1')).resolves.toMatchObject({
			id: 'attachment-1'
		});
	});
});

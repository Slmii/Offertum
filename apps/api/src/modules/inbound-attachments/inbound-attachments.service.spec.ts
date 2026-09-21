import { EmailProvider, InboundAttachmentStatus } from '@/generated/prisma/enums';
import { INBOUND_ATTACHMENT_MAX_BYTES } from '@/lib/attachments/inbound-attachment-constraints';
import { InboundAttachmentRetryableError, InboundAttachmentTooLargeError } from '@/lib/email/raw-message-attachments';
import {
	InboundAttachmentsService,
	type InboundAttachmentSource
} from '@/modules/inbound-attachments/inbound-attachments.service';

type Row = {
	id: string;
	providerAttachmentId: string;
	filename: string;
	mimeType: string;
	sizeBytes: number | null;
	status: InboundAttachmentStatus;
	extractedText: string | null;
	isTruncated: boolean;
	fetchAttempts: number;
};

const gmailSource = (parts: unknown[]): InboundAttachmentSource => ({
	id: 'raw-1',
	organizationId: 'org-1',
	provider: EmailProvider.GMAIL,
	raw: { payload: { mimeType: 'multipart/mixed', parts } }
});

const pdfPart = (filename = 'bestek.pdf', attachmentId = 'att-1', size = 1200) => ({
	filename,
	mimeType: 'application/pdf',
	body: { attachmentId, size }
});

function makeService(
	opts: {
		rows?: Row[];
		isReadingEnabled?: boolean;
		userId?: string | null;
		disconnectedAt?: Date | null;
		bytes?: Buffer | null;
		extract?: jest.Mock;
		listMessageAttachments?: jest.Mock;
	} = {}
) {
	const rows: Row[] = opts.rows ?? [];
	const prisma = {
		rawMessageAttachment: {
			createMany: jest.fn().mockReturnValue(Promise.resolve({ count: 1 })),
			findMany: jest
				.fn()
				.mockImplementation(({ where }: { where: { status: InboundAttachmentStatus } }) =>
					Promise.resolve(rows.filter(r => r.status === where.status))
				),
			update: jest
				.fn()
				.mockImplementation(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
					const row = rows.find(r => r.id === where.id)!;
					const { fetchAttempts, ...rest } = data;
					if (fetchAttempts) {
						row.fetchAttempts += (fetchAttempts as { increment: number }).increment;
					}
					Object.assign(row, rest);
					return Promise.resolve({});
				}),
			updateMany: jest.fn().mockReturnValue(Promise.resolve({ count: 1 }))
		},
		rawMessage: {
			findUnique: jest.fn().mockReturnValue(
				Promise.resolve({
					providerMessageId: 'provider-msg-1',
					emailAccount: {
						userId: opts.userId === undefined ? 'user-1' : opts.userId,
						disconnectedAt: opts.disconnectedAt ?? null,
						organization: { aiAttachmentReadingEnabled: opts.isReadingEnabled ?? true }
					}
				})
			)
		}
	};
	const emailAccounts = {
		withFreshAccessToken: jest
			.fn()
			.mockImplementation((_scope: unknown, fn: (token: string) => unknown) => fn('token'))
	};
	const gmail = {
		getAttachment: jest
			.fn()
			.mockReturnValue(Promise.resolve(opts.bytes === undefined ? Buffer.from('%PDF-') : opts.bytes))
	};
	const microsoft = {
		listMessageAttachments: opts.listMessageAttachments ?? jest.fn().mockReturnValue(Promise.resolve([])),
		getAttachmentContent: jest.fn().mockReturnValue(Promise.resolve(Buffer.from('x')))
	};
	const extractor = {
		extract:
			opts.extract ??
			jest
				.fn()
				.mockReturnValue(Promise.resolve({ status: 'PARSED', text: '120 m2 dakpannen', isTruncated: false }))
	};
	const logService = { logAction: jest.fn() };

	const service = new InboundAttachmentsService(
		prisma as never,
		emailAccounts as never,
		gmail as never,
		microsoft as never,
		extractor as never,
		logService as never
	);
	return { service, prisma, emailAccounts, gmail, microsoft, extractor, logService, rows };
}

const pendingRow = (overrides: Partial<Row> = {}): Row => ({
	id: 'row-1',
	providerAttachmentId: 'att-1',
	filename: 'bestek.pdf',
	mimeType: 'application/pdf',
	sizeBytes: 1200,
	status: InboundAttachmentStatus.PENDING,
	extractedText: null,
	isTruncated: false,
	fetchAttempts: 0,
	...overrides
});

describe('InboundAttachmentsService.listMetadata', () => {
	it('records Gmail attachments from the persisted payload without any provider call', async () => {
		const { service, prisma, emailAccounts } = makeService();

		const result = await service.listMetadata(gmailSource([pdfPart()]));

		expect(result).toEqual([{ filename: 'bestek.pdf', mimeType: 'application/pdf' }]);
		expect(emailAccounts.withFreshAccessToken).not.toHaveBeenCalled();
		expect(prisma.rawMessageAttachment.createMany).toHaveBeenCalledWith(
			expect.objectContaining({ skipDuplicates: true })
		);
	});

	// Signature logos and embedded images are not "attachments" in any sense the owner means.
	it('drops inline parts', async () => {
		const { service, prisma } = makeService();
		const logo = {
			filename: 'logo.png',
			mimeType: 'image/png',
			headers: [{ name: 'Content-Disposition', value: 'inline; filename="logo.png"' }],
			body: { attachmentId: 'att-logo', size: 900 }
		};

		expect(await service.listMetadata(gmailSource([logo]))).toEqual([]);
		expect(prisma.rawMessageAttachment.createMany).not.toHaveBeenCalled();
	});

	it('caps how many attachments per message are considered', async () => {
		const { service } = makeService();
		const parts = Array.from({ length: 9 }, (_, i) => pdfPart(`bijlage-${i}.pdf`, `att-${i}`));

		expect(await service.listMetadata(gmailSource(parts))).toHaveLength(5);
	});

	it('skips the Graph call when Microsoft says there are no attachments', async () => {
		const { service, microsoft } = makeService();

		const result = await service.listMetadata({
			id: 'raw-1',
			organizationId: 'org-1',
			provider: EmailProvider.MICROSOFT,
			raw: { hasAttachments: false }
		});

		expect(result).toEqual([]);
		expect(microsoft.listMessageAttachments).not.toHaveBeenCalled();
	});

	// Rows synced before `hasAttachments` was selected: unknown means go and look.
	it('asks Graph when the hasAttachments field is absent', async () => {
		const listMessageAttachments = jest
			.fn()
			.mockReturnValue(
				Promise.resolve([
					{
						providerAttachmentId: 'a1',
						filename: 'eisen.docx',
						mimeType: 'application/msword',
						sizeBytes: 10,
						isInline: false
					}
				])
			);
		const { service } = makeService({ listMessageAttachments });

		const result = await service.listMetadata({
			id: 'raw-1',
			organizationId: 'org-1',
			provider: EmailProvider.MICROSOFT,
			raw: {}
		});

		expect(listMessageAttachments).toHaveBeenCalledWith('token', 'provider-msg-1', expect.any(Number));
		expect(result).toEqual([{ filename: 'eisen.docx', mimeType: 'application/msword' }]);
	});

	// Regression (audit): Apple Mail sends ordinary PDF attachments as `Content-Disposition: inline`.
	it('keeps an inline part when it is a readable document', async () => {
		const { service } = makeService();
		const applePdf = {
			...pdfPart('offerteaanvraag.pdf'),
			headers: [{ name: 'Content-Disposition', value: 'inline; filename="offerteaanvraag.pdf"' }]
		};

		expect(await service.listMetadata(gmailSource([applePdf]))).toEqual([
			{ filename: 'offerteaanvraag.pdf', mimeType: 'application/pdf' }
		]);
	});

	// Regression (audit): truncating at 120 chars used to chop ".pdf" off, and with a generic MIME
	// type the extension is the only thing that says what the file is.
	it('truncates the stem of a long filename, never the extension', async () => {
		const { service } = makeService();
		const long = `${'x'.repeat(300)}.pdf`;

		const [first] = await service.listMetadata(
			gmailSource([{ ...pdfPart(long), mimeType: 'application/octet-stream' }])
		);

		expect(first!.filename).toHaveLength(120);
		expect(first!.filename.endsWith('.pdf')).toBe(true);
	});

	it('strips control and bidi-override characters from filenames', async () => {
		const { service } = makeService();
		const nul = String.fromCharCode(0);
		const rightToLeftOverride = String.fromCharCode(0x202e);

		const [first] = await service.listMetadata(gmailSource([pdfPart(`fac${nul}tuur${rightToLeftOverride}.pdf`)]));

		expect(first!.filename).toBe('factuur.pdf');
	});

	it('records the position of each part so ordering is deterministic', async () => {
		const { service, prisma } = makeService();

		await service.listMetadata(gmailSource([pdfPart('een.pdf', 'a1'), pdfPart('twee.pdf', 'a2')]));

		const { data } = prisma.rawMessageAttachment.createMany.mock.calls[0]![0] as {
			data: Array<{ position: number }>;
		};
		expect(data.map(d => d.position)).toEqual([0, 1]);
	});

	// A provider failure while LISTING is retryable too: classifying without even the filenames
	// would make the verdict permanent.
	it('rethrows a Graph listing failure as retryable', async () => {
		const listMessageAttachments = jest.fn().mockReturnValue(Promise.reject(new Error('429')));
		const { service } = makeService({ listMessageAttachments });

		await expect(
			service.listMetadata({ id: 'raw-1', organizationId: 'org-1', provider: EmailProvider.MICROSOFT, raw: {} })
		).rejects.toBeInstanceOf(InboundAttachmentRetryableError);
	});

	// The contract the pipeline relies on: attachment trouble never costs the owner a lead.
	it('degrades to no attachments instead of throwing', async () => {
		const { service, prisma, logService } = makeService();
		prisma.rawMessageAttachment.createMany.mockReturnValue(Promise.reject(new Error('db down')));

		await expect(service.listMetadata(gmailSource([pdfPart()]))).resolves.toEqual([]);
		expect(logService.logAction).toHaveBeenCalledWith(
			expect.objectContaining({ action: 'inbound_attachment.metadata_failed', level: 'warn' })
		);
	});
});

describe('InboundAttachmentsService.readText', () => {
	const source = gmailSource([pdfPart()]);

	it('downloads, parses, persists, and returns text headed by the filename', async () => {
		const { service, rows, gmail } = makeService({ rows: [pendingRow()] });

		const text = await service.readText(source);

		expect(gmail.getAttachment).toHaveBeenCalledWith(
			'token',
			'provider-msg-1',
			'att-1',
			expect.objectContaining({ maxBytes: INBOUND_ATTACHMENT_MAX_BYTES })
		);
		expect(rows[0]).toMatchObject({ status: InboundAttachmentStatus.PARSED, extractedText: '120 m2 dakpannen' });
		expect(text).toBe('=== Bijlage: bestek.pdf ===\n120 m2 dakpannen');
	});

	// The AVG switch: with it off, nothing beyond the email body may reach the AI provider.
	it('reads nothing when the org has AI attachment reading switched off', async () => {
		const { service, gmail, extractor, rows } = makeService({ rows: [pendingRow()], isReadingEnabled: false });

		expect(await service.readText(source)).toBeNull();
		expect(gmail.getAttachment).not.toHaveBeenCalled();
		expect(extractor.extract).not.toHaveBeenCalled();
		expect(rows[0]!.status).toBe(InboundAttachmentStatus.PENDING);
	});

	it('never spends a provider call on a file it would refuse anyway', async () => {
		const { service, gmail, rows } = makeService({
			rows: [
				pendingRow({ id: 'r-photo', filename: 'foto.jpg', mimeType: 'image/jpeg' }),
				pendingRow({ id: 'r-big', providerAttachmentId: 'att-2', sizeBytes: INBOUND_ATTACHMENT_MAX_BYTES + 1 })
			]
		});

		expect(await service.readText(source)).toBeNull();
		expect(gmail.getAttachment).not.toHaveBeenCalled();
		expect(rows.map(r => r.status)).toEqual([
			InboundAttachmentStatus.UNSUPPORTED,
			InboundAttachmentStatus.TOO_LARGE
		]);
	});

	it('records EMPTY for a scan and returns no text', async () => {
		const extract = jest.fn().mockReturnValue(Promise.resolve({ status: 'EMPTY', text: null, isTruncated: false }));
		const { service, rows } = makeService({ rows: [pendingRow()], extract });

		expect(await service.readText(source)).toBeNull();
		expect(rows[0]!.status).toBe(InboundAttachmentStatus.EMPTY);
	});

	it('marks the attachment FAILED when the provider no longer has it', async () => {
		const { service, rows, extractor } = makeService({ rows: [pendingRow()], bytes: null });

		expect(await service.readText(source)).toBeNull();
		expect(rows[0]!.status).toBe(InboundAttachmentStatus.FAILED);
		expect(extractor.extract).not.toHaveBeenCalled();
	});

	// Regression (audit): a transient failure used to be swallowed. The message was then classified
	// without its attachment — and classified messages are never scanned again, so one network
	// blip lost a "zie bijlage" lead for good while the row sat at PENDING forever.
	it('rethrows a transient download failure as retryable, after still reading the other files', async () => {
		const { service, gmail, rows } = makeService({
			rows: [
				pendingRow(),
				pendingRow({ id: 'row-2', providerAttachmentId: 'att-2', filename: 'stuklijst.xlsx', mimeType: '' })
			]
		});
		gmail.getAttachment.mockReturnValueOnce(Promise.reject(new Error('boom')));

		await expect(service.readText(source)).rejects.toBeInstanceOf(InboundAttachmentRetryableError);

		expect(rows[0]).toMatchObject({ status: InboundAttachmentStatus.PENDING, fetchAttempts: 1 });
		expect(rows[1]!.status).toBe(InboundAttachmentStatus.PARSED);
	});

	it('gives up on a file after the attempt cap instead of retrying forever', async () => {
		const { service, gmail, rows } = makeService({ rows: [pendingRow({ fetchAttempts: 2 })] });
		gmail.getAttachment.mockReturnValue(Promise.reject(new Error('still down')));

		// Third and last attempt fails: settle FAILED and let classification proceed without it.
		await expect(service.readText(source)).resolves.toBeNull();
		expect(rows[0]).toMatchObject({ status: InboundAttachmentStatus.FAILED, fetchAttempts: 3 });
	});

	// The write-ahead counter is what survives a parse that OOM-kills the process: no catch block
	// runs, but the increment is already committed.
	it('refuses a file whose attempts were already exhausted without touching the provider', async () => {
		const { service, gmail, extractor, rows } = makeService({ rows: [pendingRow({ fetchAttempts: 3 })] });

		await expect(service.readText(source)).resolves.toBeNull();
		expect(gmail.getAttachment).not.toHaveBeenCalled();
		expect(extractor.extract).not.toHaveBeenCalled();
		expect(rows[0]!.status).toBe(InboundAttachmentStatus.FAILED);
	});

	it('counts the attempt BEFORE downloading', async () => {
		const { service, gmail, rows } = makeService({ rows: [pendingRow()] });
		gmail.getAttachment.mockImplementation(() => {
			expect(rows[0]!.fetchAttempts).toBe(1);
			return Promise.resolve(Buffer.from('%PDF-'));
		});

		await service.readText(source);
		expect(gmail.getAttachment).toHaveBeenCalledTimes(1);
	});

	it('discards stored text for a message that turned out not to be a request', async () => {
		const { service, prisma } = makeService();

		await service.discardText('raw-1');

		expect(prisma.rawMessageAttachment.updateMany).toHaveBeenCalledWith({
			where: { rawMessageId: 'raw-1', extractedText: { not: null } },
			data: { extractedText: null }
		});
	});

	it('cannot read from an orphaned or disconnected mailbox, and says nothing rather than throwing', async () => {
		const orphaned = makeService({ rows: [pendingRow()], userId: null });
		const disconnected = makeService({ rows: [pendingRow()], disconnectedAt: new Date() });

		await expect(orphaned.service.readText(source)).resolves.toBeNull();
		await expect(disconnected.service.readText(source)).resolves.toBeNull();
		expect(orphaned.gmail.getAttachment).not.toHaveBeenCalled();
	});

	it('keeps the combined text inside the prompt budget', async () => {
		const extract = jest
			.fn()
			.mockReturnValue(Promise.resolve({ status: 'PARSED', text: 'x'.repeat(9000), isTruncated: false }));
		const { service } = makeService({
			rows: [pendingRow(), pendingRow({ id: 'row-2', providerAttachmentId: 'att-2', filename: 'tweede.pdf' })],
			extract
		});

		const text = await service.readText(source);

		// The WHOLE assembled string — headers and separators included — fits the budget, so the
		// prompt's own slice can never silently cut the tail off the last file.
		expect(text!.length).toBeLessThanOrEqual(12_000);
		expect(text).toContain('=== Bijlage: tweede.pdf ===');
	});

	// Regression (review finding): the switch used to be checked only when there was something
	// left to download. Text parsed on an earlier attempt then still reached the AI provider
	// after the owner had switched reading off.
	it('withholds already-parsed text once the org switches reading off', async () => {
		const parsed = pendingRow({ status: InboundAttachmentStatus.PARSED, extractedText: 'vertrouwelijk bestek' });
		const { service, gmail } = makeService({ rows: [parsed], isReadingEnabled: false });

		expect(await service.readText(source)).toBeNull();
		expect(gmail.getAttachment).not.toHaveBeenCalled();
	});

	it('maps a provider-side size refusal to TOO_LARGE', async () => {
		const { service, gmail, rows } = makeService({ rows: [pendingRow({ sizeBytes: null })] });
		gmail.getAttachment.mockReturnValueOnce(Promise.reject(new InboundAttachmentTooLargeError()));

		expect(await service.readText(source)).toBeNull();
		expect(rows[0]!.status).toBe(InboundAttachmentStatus.TOO_LARGE);
	});

	it('survives a logger that throws', async () => {
		const { service, prisma, logService } = makeService({ rows: [pendingRow()] });
		prisma.rawMessage.findUnique.mockReturnValue(Promise.reject(new Error('db down')));
		logService.logAction.mockImplementation(() => {
			throw new Error('logger down');
		});

		await expect(service.readText(source)).resolves.toBeNull();
	});

	it('degrades to null instead of throwing', async () => {
		const { service, prisma, logService } = makeService({ rows: [pendingRow()] });
		prisma.rawMessageAttachment.findMany.mockReturnValue(Promise.reject(new Error('db down')));

		await expect(service.readText(source)).resolves.toBeNull();
		expect(logService.logAction).toHaveBeenCalledWith(
			expect.objectContaining({ action: 'inbound_attachment.read_failed' })
		);
	});
});

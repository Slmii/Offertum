import type { LogService } from '@/modules/logger/log.service';
import { MicrosoftGraphApiService } from '@/modules/microsoft/microsoft-graph-api.service';
import { afterEach, describe, expect, it, jest } from '@jest/globals';

const logServiceStub = { logAction: jest.fn() } as unknown as LogService;

function makeJsonResponse(body: unknown, init: Partial<{ status: number; ok: boolean }> = {}): Response {
	return {
		status: init.status ?? 200,
		ok: init.ok ?? true,
		text: () => Promise.resolve(''),
		json: () => Promise.resolve(body)
	} as unknown as Response;
}

describe('MicrosoftGraphApiService.createSubscription', () => {
	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('defaults `resource` to /me/mailFolders/Inbox/messages so pushes are inbox-scoped, matching backfill + delta-walk', async () => {
		const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(() =>
			Promise.resolve(
				makeJsonResponse({
					id: 'sub-1',
					expirationDateTime: new Date().toISOString(),
					clientState: 'echo'
				})
			)
		);

		const service = new MicrosoftGraphApiService(logServiceStub);
		await service.createSubscription('TOKEN', {
			notificationUrl: 'https://example.com/hook',
			expirationDateTime: new Date(Date.now() + 60_000).toISOString(),
			clientState: 'shared'
			// resource intentionally omitted — exercises the default
		});

		const fetchInit = fetchSpy.mock.calls[0]?.[1] as RequestInit;
		const body = JSON.parse(String(fetchInit.body)) as { resource: string };
		expect(body.resource).toBe('/me/mailFolders/Inbox/messages');
	});

	it('honors an explicit resource override (for future use cases like calendar / files)', async () => {
		const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(() =>
			Promise.resolve(
				makeJsonResponse({
					id: 'sub-2',
					expirationDateTime: new Date().toISOString(),
					clientState: 'echo'
				})
			)
		);

		const service = new MicrosoftGraphApiService(logServiceStub);
		await service.createSubscription('TOKEN', {
			notificationUrl: 'https://example.com/hook',
			expirationDateTime: new Date(Date.now() + 60_000).toISOString(),
			clientState: 'shared',
			resource: '/me/events'
		});

		const body = JSON.parse(String((fetchSpy.mock.calls[0]?.[1] as RequestInit).body)) as {
			resource: string;
		};
		expect(body.resource).toBe('/me/events');
	});
});

describe('MicrosoftGraphApiService.listMessageAttachments', () => {
	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('keeps only fileAttachment entries and drops item/reference attachments', async () => {
		jest.spyOn(global, 'fetch').mockImplementation(() =>
			Promise.resolve(
				makeJsonResponse({
					value: [
						{
							'@odata.type': '#microsoft.graph.fileAttachment',
							id: 'att-1',
							name: 'offerte.pdf',
							contentType: 'application/PDF',
							size: 999,
							isInline: false
						},
						{ '@odata.type': '#microsoft.graph.itemAttachment', id: 'att-2', name: 'forwarded.eml' },
						{ '@odata.type': '#microsoft.graph.referenceAttachment', id: 'att-3', name: 'link' }
					]
				})
			)
		);

		const service = new MicrosoftGraphApiService(logServiceStub);
		const result = await service.listMessageAttachments('TOKEN', 'msg-1');

		expect(result).toEqual([
			{
				providerAttachmentId: 'att-1',
				filename: 'offerte.pdf',
				mimeType: 'application/pdf',
				sizeBytes: 999,
				isInline: false
			}
		]);
	});

	it('returns [] on 404', async () => {
		jest.spyOn(global, 'fetch').mockImplementation(() => Promise.resolve(makeJsonResponse({}, { status: 404 })));

		const service = new MicrosoftGraphApiService(logServiceStub);
		expect(await service.listMessageAttachments('TOKEN', 'msg-1')).toEqual([]);
	});
});

describe('MicrosoftGraphApiService.getAttachmentContent', () => {
	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('returns the raw bytes as a Buffer', async () => {
		const bytes = new TextEncoder().encode('hello').buffer;
		jest.spyOn(global, 'fetch').mockImplementation(() =>
			Promise.resolve({
				status: 200,
				ok: true,
				text: () => Promise.resolve(''),
				arrayBuffer: () => Promise.resolve(bytes)
			} as unknown as Response)
		);

		const service = new MicrosoftGraphApiService(logServiceStub);
		const buffer = await service.getAttachmentContent('TOKEN', 'msg-1', 'att-1');

		expect(buffer?.toString('utf8')).toBe('hello');
	});

	it('returns null on 404', async () => {
		jest.spyOn(global, 'fetch').mockImplementation(() => Promise.resolve(makeJsonResponse({}, { status: 404 })));

		const service = new MicrosoftGraphApiService(logServiceStub);
		expect(await service.getAttachmentContent('TOKEN', 'msg-1', 'att-1')).toBeNull();
	});
});

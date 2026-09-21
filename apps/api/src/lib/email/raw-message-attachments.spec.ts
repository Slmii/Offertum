import { hasMicrosoftAttachments, listGmailAttachmentsFromRaw } from '@/lib/email/raw-message-attachments';
import { describe, expect, it } from '@jest/globals';

describe('listGmailAttachmentsFromRaw', () => {
	it('finds an attachment nested two levels deep in multipart parts', () => {
		const raw = {
			payload: {
				mimeType: 'multipart/mixed',
				parts: [
					{
						mimeType: 'multipart/alternative',
						parts: [{ mimeType: 'text/plain', body: { data: 'aGk' } }]
					},
					{
						mimeType: 'application/pdf',
						filename: 'offerte.pdf',
						body: { attachmentId: 'ATT-1', size: 12345 }
					}
				]
			}
		};

		const result = listGmailAttachmentsFromRaw(raw);

		expect(result).toEqual([
			{
				providerAttachmentId: 'ATT-1',
				filename: 'offerte.pdf',
				mimeType: 'application/pdf',
				sizeBytes: 12345,
				isInline: false
			}
		]);
	});

	it('excludes an inline image flagged via Content-Disposition', () => {
		const raw = {
			payload: {
				parts: [
					{
						mimeType: 'image/png',
						filename: 'logo.png',
						body: { attachmentId: 'ATT-INLINE', size: 500 },
						headers: [{ name: 'Content-Disposition', value: 'inline; filename="logo.png"' }]
					}
				]
			}
		};

		const [attachment] = listGmailAttachmentsFromRaw(raw);

		expect(attachment?.isInline).toBe(true);
	});

	it('excludes an inline image flagged via Content-ID + image mime type', () => {
		const raw = {
			payload: {
				parts: [
					{
						mimeType: 'image/jpeg',
						filename: 'signature.jpg',
						body: { attachmentId: 'ATT-CID', size: 700 },
						headers: [{ name: 'Content-ID', value: '<abc123>' }]
					}
				]
			}
		};

		const [attachment] = listGmailAttachmentsFromRaw(raw);

		expect(attachment?.isInline).toBe(true);
	});

	it('ignores a part with a filename but no attachmentId (not an attachment)', () => {
		const raw = {
			payload: {
				parts: [{ mimeType: 'text/plain', filename: 'notes.txt', body: { data: 'aGk' } }]
			}
		};

		expect(listGmailAttachmentsFromRaw(raw)).toEqual([]);
	});

	it('never throws on malformed input', () => {
		expect(listGmailAttachmentsFromRaw(null)).toEqual([]);
		expect(listGmailAttachmentsFromRaw('x')).toEqual([]);
		expect(listGmailAttachmentsFromRaw([])).toEqual([]);
		expect(listGmailAttachmentsFromRaw({ payload: 5 })).toEqual([]);
		expect(listGmailAttachmentsFromRaw(undefined)).toEqual([]);
	});

	it('stops recursing past the depth cap', () => {
		// Build a chain of 25 nested single-child parts — deeper than MAX_MIME_DEPTH (20) —
		// with the attachment at the very bottom so it must be excluded.
		type NestedPart = { mimeType: string; parts?: NestedPart[]; filename?: string; body?: { attachmentId: string } };
		let leaf: NestedPart = {
			mimeType: 'application/pdf',
			filename: 'buried.pdf',
			body: { attachmentId: 'ATT-DEEP' }
		};
		for (let i = 0; i < 25; i++) {
			leaf = { mimeType: 'multipart/mixed', parts: [leaf] };
		}

		expect(listGmailAttachmentsFromRaw({ payload: leaf })).toEqual([]);
	});
});

describe('hasMicrosoftAttachments', () => {
	it('returns true when hasAttachments is true', () => {
		expect(hasMicrosoftAttachments({ hasAttachments: true })).toBe(true);
	});

	it('returns false when hasAttachments is false', () => {
		expect(hasMicrosoftAttachments({ hasAttachments: false })).toBe(false);
	});

	it('returns null when hasAttachments is absent (pre-migration rows)', () => {
		expect(hasMicrosoftAttachments({ id: 'msg-1' })).toBeNull();
	});

	it('returns null on malformed input', () => {
		expect(hasMicrosoftAttachments(null)).toBeNull();
		expect(hasMicrosoftAttachments('x')).toBeNull();
	});
});

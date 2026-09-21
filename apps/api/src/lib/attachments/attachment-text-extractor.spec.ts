import { AttachmentTextExtractor } from '@/lib/attachments/attachment-text-extractor';
import {
	INBOUND_ATTACHMENT_MAX_BYTES,
	INBOUND_ATTACHMENT_MAX_CHARS,
	resolveInboundAttachmentKind
} from '@/lib/attachments/inbound-attachment-constraints';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Real files, not mocks: the parsers ARE the behaviour under test. The legacy fixtures are
// genuine OLE binaries (.doc via macOS textutil, .xls written as BIFF8), not renamed text.
const fixture = (name: string) => readFileSync(join(__dirname, '__fixtures__', name));

describe('resolveInboundAttachmentKind', () => {
	it('resolves by MIME type', () => {
		expect(resolveInboundAttachmentKind('application/pdf', 'x')).toBe('pdf');
		expect(resolveInboundAttachmentKind('application/msword', 'x')).toBe('doc');
		expect(resolveInboundAttachmentKind('application/vnd.ms-excel', 'x')).toBe('spreadsheet');
		expect(resolveInboundAttachmentKind('text/plain; charset=utf-8', 'x')).toBe('text');
	});

	// Mail clients routinely send real documents as application/octet-stream.
	it('falls back to the extension when the MIME type is generic', () => {
		expect(resolveInboundAttachmentKind('application/octet-stream', 'Bestek.PDF')).toBe('pdf');
		expect(resolveInboundAttachmentKind('application/octet-stream', 'eisen.docx')).toBe('docx');
		expect(resolveInboundAttachmentKind('application/octet-stream', 'oud.doc')).toBe('doc');
		expect(resolveInboundAttachmentKind('', 'lijst.xls')).toBe('spreadsheet');
	});

	it('returns null for formats we cannot read', () => {
		expect(resolveInboundAttachmentKind('image/jpeg', 'foto.jpg')).toBeNull();
		expect(resolveInboundAttachmentKind('application/zip', 'tekeningen.zip')).toBeNull();
		expect(resolveInboundAttachmentKind('application/octet-stream', 'geen-extensie')).toBeNull();
	});
});

describe('AttachmentTextExtractor', () => {
	const extractor = new AttachmentTextExtractor();

	it('reads a PDF', async () => {
		const result = await extractor.extract({
			filename: 'offerteaanvraag.pdf',
			mimeType: 'application/pdf',
			bytes: fixture('offerteaanvraag.pdf')
		});
		expect(result.status).toBe('PARSED');
		expect(result.text).toContain('Offerteaanvraag NetSuite integratie');
		expect(result.text).toContain('15 oktober');
		expect(result.isTruncated).toBe(false);
	});

	it('stops at the page cap and says so', async () => {
		const result = await extractor.extract({
			filename: 'bestek.pdf',
			mimeType: 'application/pdf',
			bytes: fixture('bestek-45-paginas.pdf')
		});
		expect(result.status).toBe('PARSED');
		expect(result.text).toContain('Pagina 40 van het bestek');
		expect(result.text).not.toContain('Pagina 41 van het bestek');
		expect(result.isTruncated).toBe(true);
	});

	// A scan has pages but no text layer. It must read as EMPTY — "we could not read this" —
	// never as a successful parse of nothing.
	it('reports a PDF without a text layer as EMPTY', async () => {
		const result = await extractor.extract({
			filename: 'scan.pdf',
			mimeType: 'application/pdf',
			bytes: fixture('scan-zonder-tekstlaag.pdf')
		});
		expect(result).toEqual({ status: 'EMPTY', text: null, isTruncated: false });
	});

	it('reads a .docx', async () => {
		const result = await extractor.extract({
			filename: 'programma-van-eisen.docx',
			mimeType: 'application/octet-stream',
			bytes: fixture('programma-van-eisen.docx')
		});
		expect(result.status).toBe('PARSED');
		expect(result.text).toContain('drie integraties');
	});

	it('reads a legacy .doc', async () => {
		const result = await extractor.extract({
			filename: 'werkomschrijving.doc',
			mimeType: 'application/msword',
			bytes: fixture('werkomschrijving-legacy.doc')
		});
		expect(result.status).toBe('PARSED');
		expect(result.text).toContain('120 m2 dakpannen');
	});

	it('reads every sheet of an .xlsx and keeps rows tabular', async () => {
		const result = await extractor.extract({
			filename: 'stuklijst.xlsx',
			mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			bytes: fixture('stuklijst.xlsx')
		});
		expect(result.status).toBe('PARSED');
		expect(result.text).toContain('Blad: Stuklijst');
		expect(result.text).toContain('Warmtepomp 8kW | 2 | stuks');
		expect(result.text).toContain('Blad: Planning');
		expect(result.text).toContain('15 oktober 2026');
	});

	it('reads a legacy .xls', async () => {
		const result = await extractor.extract({
			filename: 'materiaallijst.xls',
			mimeType: 'application/vnd.ms-excel',
			bytes: fixture('materiaallijst-legacy.xls')
		});
		expect(result.status).toBe('PARSED');
		expect(result.text).toContain('Radiator type 22 | 6 | stuks');
	});

	it('reads plain text and truncates at the character cap', async () => {
		const result = await extractor.extract({
			filename: 'notities.txt',
			mimeType: 'text/plain',
			bytes: Buffer.from('a'.repeat(INBOUND_ATTACHMENT_MAX_CHARS + 500))
		});
		expect(result.status).toBe('PARSED');
		expect(result.text).toHaveLength(INBOUND_ATTACHMENT_MAX_CHARS);
		expect(result.isTruncated).toBe(true);
	});

	// NUL is legal in extracted text and illegal in a Postgres text column.
	it('strips characters Postgres cannot store', async () => {
		const result = await extractor.extract({
			filename: 'raar.txt',
			mimeType: 'text/plain',
			bytes: Buffer.from(`voor${String.fromCharCode(0)}na${String.fromCharCode(7)}`)
		});
		expect(result.text).toBe('voorna');
	});

	it('refuses oversized files without parsing them', async () => {
		const result = await extractor.extract({
			filename: 'enorm.pdf',
			mimeType: 'application/pdf',
			bytes: Buffer.alloc(INBOUND_ATTACHMENT_MAX_BYTES + 1)
		});
		expect(result.status).toBe('TOO_LARGE');
	});

	it('marks unreadable formats UNSUPPORTED', async () => {
		const result = await extractor.extract({
			filename: 'foto.jpg',
			mimeType: 'image/jpeg',
			bytes: Buffer.from('x')
		});
		expect(result.status).toBe('UNSUPPORTED');
	});

	// The filename says PDF; the bytes do not. Must not reach the parser, must not throw.
	it('fails closed when the bytes do not match the claimed format', async () => {
		for (const filename of ['nep.pdf', 'nep.docx', 'nep.doc']) {
			const result = await extractor.extract({
				filename,
				mimeType: 'application/octet-stream',
				bytes: Buffer.from('dit is gewoon tekst, geen document')
			});
			expect(result.status).toBe('FAILED');
		}
	});

	// A ".xls" that is neither zip nor OLE is almost always an HTML table exported by an ERP
	// system: a format we do not read, which is a more honest answer than "corrupt".
	it('reports a non-Excel .xls as UNSUPPORTED rather than FAILED', async () => {
		const result = await extractor.extract({
			filename: 'export.xls',
			mimeType: 'application/vnd.ms-excel',
			bytes: Buffer.from('<html><table><tr><td>Artikel</td></tr></table></html>')
		});
		expect(result.status).toBe('UNSUPPORTED');
	});

	it('never throws on a corrupt file', async () => {
		const corrupt = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(200, 1)]);
		await expect(
			extractor.extract({ filename: 'kapot.pdf', mimeType: 'application/pdf', bytes: corrupt })
		).resolves.toMatchObject({ status: 'FAILED' });
	});

	// Regression (audit, proven by execution): releasing a slot used to decrement the counter and
	// let the woken waiter re-increment it later. A caller arriving in between took the vacancy
	// first, and then BOTH ran — 3 parsers alive with a cap of 2.
	it('never runs more parsers at once than the cap, even when callers arrive as slots free up', async () => {
		const gated = new AttachmentTextExtractor();
		let active = 0;
		let peak = 0;
		jest.spyOn(gated as unknown as { parseInWorker: () => Promise<unknown> }, 'parseInWorker').mockImplementation(
			async () => {
				active += 1;
				peak = Math.max(peak, active);
				await new Promise(resolve => setTimeout(resolve, 4));
				active -= 1;
				return { ok: true, text: 'tekst', isTruncated: false };
			}
		);
		const pdf = { filename: 'a.pdf', mimeType: 'application/pdf', bytes: Buffer.from('%PDF-1.7') };

		// A burst that fills the gate, plus stragglers timed to land exactly as slots are released.
		const burst = Array.from({ length: 6 }, () => gated.extract(pdf));
		const stragglers: Array<Promise<unknown>> = [];
		for (let i = 0; i < 8; i++) {
			await new Promise(resolve => setTimeout(resolve, 3));
			stragglers.push(gated.extract(pdf));
		}
		const results = await Promise.all([...burst, ...stragglers]);

		expect(peak).toBeLessThanOrEqual(2);
		expect(results).toHaveLength(14);
		expect(active).toBe(0);
	});
});

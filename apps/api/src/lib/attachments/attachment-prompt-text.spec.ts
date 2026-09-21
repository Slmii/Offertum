import {
	excerptAttachmentBlocks,
	formatAttachmentBlocks,
	isAttachmentRescueCandidate
} from '@/lib/attachments/attachment-prompt-text';

const PDF = { filename: 'bestek.pdf', mimeType: 'application/pdf' };

describe('isAttachmentRescueCandidate', () => {
	it('is true for a negative, thin-bodied mail with a readable document', () => {
		expect(isAttachmentRescueCandidate({ isQuote: false, bodyLength: 40, attachments: [PDF] })).toBe(true);
	});

	it('is false when the verdict was already positive, the body is substantial, or nothing is readable', () => {
		expect(isAttachmentRescueCandidate({ isQuote: true, bodyLength: 40, attachments: [PDF] })).toBe(false);
		expect(isAttachmentRescueCandidate({ isQuote: false, bodyLength: 900, attachments: [PDF] })).toBe(false);
		expect(
			isAttachmentRescueCandidate({
				isQuote: false,
				bodyLength: 40,
				attachments: [{ filename: 'foto.jpg', mimeType: 'image/jpeg' }]
			})
		).toBe(false);
	});

	// Audit: an SMB inbox is full of two-line mails carrying invoices and payslips. None of those
	// should be downloaded, parsed and sent to the AI provider on the strength of a short body.
	it.each([
		'Factuur_2026-0412.pdf',
		'invoice-881.pdf',
		'Pakbon 5521.pdf',
		'loonstrook-mei.pdf',
		'Orderbevestiging.pdf',
		'Creditnota.pdf'
	])('does not rescue on %s', filename => {
		expect(
			isAttachmentRescueCandidate({
				isQuote: false,
				bodyLength: 40,
				attachments: [{ filename, mimeType: 'application/pdf' }]
			})
		).toBe(false);
	});

	it('still rescues when a request document sits next to an invoice', () => {
		expect(
			isAttachmentRescueCandidate({
				isQuote: false,
				bodyLength: 40,
				attachments: [{ filename: 'factuur.pdf', mimeType: 'application/pdf' }, PDF]
			})
		).toBe(true);
	});
});

describe('formatAttachmentBlocks', () => {
	it('heads each file with its name', () => {
		expect(
			formatAttachmentBlocks([
				{ filename: 'a.pdf', text: 'één' },
				{ filename: 'b.xlsx', text: 'twee' }
			])
		).toBe('=== Bijlage: a.pdf ===\néén\n\n=== Bijlage: b.xlsx ===\ntwee');
	});

	it('returns null when nothing is readable', () => {
		expect(formatAttachmentBlocks([{ filename: 'scan.pdf', text: null }])).toBeNull();
	});

	// Audit: first-come budgeting let a long boilerplate document swallow everything while the file
	// that held the actual request got nothing — and the UI still said it had been read.
	it('gives every file a fair share instead of letting the first one take the budget', () => {
		const text = formatAttachmentBlocks(
			[
				{ filename: 'Algemene_voorwaarden.pdf', text: 'v'.repeat(20_000) },
				{ filename: 'stuklijst.xlsx', text: 'Warmtepomp 8kW | 2 | stuks' }
			],
			2000
		)!;

		expect(text.length).toBeLessThanOrEqual(2000);
		expect(text).toContain('=== Bijlage: stuklijst.xlsx ===\nWarmtepomp 8kW | 2 | stuks');
	});

	it('hands the share a short file does not need to the long one', () => {
		const text = formatAttachmentBlocks(
			[
				{ filename: 'kort.txt', text: 'x' },
				{ filename: 'lang.txt', text: 'y'.repeat(5000) }
			],
			1000
		)!;

		// Budget is used in full rather than wasting the short file's unused half.
		expect(text.length).toBe(1000);
	});

	it('never exceeds the budget, headers and separators included', () => {
		const files = Array.from({ length: 5 }, (_, i) => ({ filename: `bijlage-${i}.pdf`, text: 'z'.repeat(9000) }));
		expect(formatAttachmentBlocks(files)!.length).toBeLessThanOrEqual(12_000);
	});
});

describe('excerptAttachmentBlocks', () => {
	it('passes short text through untouched', () => {
		expect(excerptAttachmentBlocks('=== Bijlage: a.pdf ===\nkort', 3000)).toBe('=== Bijlage: a.pdf ===\nkort');
		expect(excerptAttachmentBlocks(null, 3000)).toBeNull();
	});

	// Audit: slicing the front off showed the classifier the first file only.
	it('keeps something of EVERY file rather than slicing the front off', () => {
		const full = formatAttachmentBlocks([
			{ filename: 'voorwaarden.pdf', text: 'v'.repeat(6000) },
			{ filename: 'aanvraag.docx', text: `Graag uw prijsopgave. ${'a'.repeat(6000)}` }
		])!;

		const excerpt = excerptAttachmentBlocks(full, 3000)!;

		expect(excerpt.length).toBeLessThanOrEqual(3000);
		expect(excerpt).toContain('=== Bijlage: aanvraag.docx ===\nGraag uw prijsopgave.');
	});
});

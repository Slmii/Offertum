/**
 * Limits for reading INBOUND email attachments into the AI pipeline.
 *
 * Distinct from `lib/storage/attachment-constraints.ts`, which governs files the OWNER
 * uploads onto an outgoing reply. Those come from a trusted, authenticated user; these come
 * from anyone on the internet who can send the mailbox an email, so every number here is a
 * defence as much as a budget.
 */

/** Attachments considered per message. Beyond this the rest stay metadata-only. */
export const INBOUND_ATTACHMENT_MAX_PER_MESSAGE = 5;

/** Per-file download cap. Larger files are recorded as TOO_LARGE and never fetched. */
export const INBOUND_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

/**
 * PDF pages actually read. Parsing is CPU-bound and the Inngest functions run inside the
 * API process, so an unbounded 600-page PDF would stall request handling. A quote request's
 * substance is essentially always in the opening pages.
 */
export const INBOUND_ATTACHMENT_MAX_PDF_PAGES = 40;

/** Extracted text kept per file. */
export const INBOUND_ATTACHMENT_MAX_CHARS = 20_000;

/**
 * Extracted text handed to the EXTRACTOR per message, across all attachments. Sized against
 * the existing prompt budgets (classifier body 4k, extractor body 6k): generous enough to
 * carry a real bestek's opening pages, not so large that one long document dominates cost.
 * The classifier gets a much smaller slice — it only needs to decide, not to read.
 */
export const INBOUND_ATTACHMENT_MAX_TOTAL_CHARS = 12_000;

/** Spreadsheet bounds. The character cap would catch a huge sheet anyway; these stop us
 *  rendering a million-row export into a string first. */
export const INBOUND_ATTACHMENT_MAX_SHEETS = 10;
export const INBOUND_ATTACHMENT_MAX_ROWS_PER_SHEET = 500;

/** Hard wall-clock budget for parsing one file; the worker thread is terminated past it. */
export const INBOUND_ATTACHMENT_PARSE_TIMEOUT_MS = 15_000;

/**
 * Heap ceiling for the parsing worker. .docx and .xlsx are zip containers, so a small hostile
 * file can inflate enormously; past this the worker dies with ERR_WORKER_OUT_OF_MEMORY and
 * the attachment is recorded FAILED instead of taking the API process down with it.
 */
export const INBOUND_ATTACHMENT_PARSE_MEMORY_MB = 256;

/**
 * Parsers alive at once, process-wide. The heap limit above does not cover off-heap buffers
 * (where zip inflation lands), so the practical memory ceiling is this number times the worst
 * single parse. The pipeline handles several messages concurrently; this keeps that from
 * multiplying into several simultaneous hostile archives.
 */
export const INBOUND_ATTACHMENT_MAX_CONCURRENT_PARSERS = 2;

/** Hard deadline for downloading one attachment from the mailbox provider. */
export const INBOUND_ATTACHMENT_DOWNLOAD_TIMEOUT_MS = 20_000;

/** Filenames are attacker-controlled and enter prompts + the UI; bound them at the door. */
export const INBOUND_ATTACHMENT_MAX_FILENAME_CHARS = 120;
export const INBOUND_ATTACHMENT_MAX_MIME_CHARS = 100;

/**
 * Download + parse attempts per attachment, counted WRITE-AHEAD (see `fetchAttempts` in the
 * schema). Bounds retries after transient provider failures, and refuses a file that keeps
 * killing the process.
 */
export const INBOUND_ATTACHMENT_MAX_FETCH_ATTEMPTS = 3;

/**
 * Wall-clock budget for reading ALL attachments of one message. Five slow files at the parse
 * timeout each would otherwise hold a pipeline step — and the process-wide parser slots that
 * other tenants are queueing for — for over a minute per message.
 */
export const INBOUND_ATTACHMENT_MESSAGE_BUDGET_MS = 45_000;

/** `doc` and `spreadsheet` cover the legacy binary formats too (.doc, .xls) — a lot of Dutch
 *  trade paperwork still circulates as Word 97 documents and BIFF workbooks. */
export type InboundAttachmentKind = 'pdf' | 'docx' | 'doc' | 'spreadsheet' | 'text';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const DOC_MIME = 'application/msword';
const SPREADSHEET_MIMES = new Set([
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	'application/vnd.ms-excel'
]);
const SPREADSHEET_EXTENSIONS = new Set(['xlsx', 'xls']);
const TEXT_MIMES = new Set(['text/plain', 'text/csv', 'text/markdown']);
const TEXT_EXTENSIONS = new Set(['txt', 'csv', 'md']);

/**
 * Which parser, if any, can read this file. MIME type first, then the extension — mail
 * clients routinely label real PDFs and Word files `application/octet-stream`, so trusting
 * the MIME type alone would silently skip them.
 */
export function resolveInboundAttachmentKind(mimeType: string, filename: string): InboundAttachmentKind | null {
	const mime = (mimeType.toLowerCase().split(';')[0] ?? '').trim();
	const extension = filename.includes('.') ? (filename.split('.').pop() ?? '').toLowerCase() : '';

	if (mime === 'application/pdf' || extension === 'pdf') {
		return 'pdf';
	}
	if (mime === DOCX_MIME || extension === 'docx') {
		return 'docx';
	}
	if (mime === DOC_MIME || extension === 'doc') {
		return 'doc';
	}
	if (SPREADSHEET_MIMES.has(mime) || SPREADSHEET_EXTENSIONS.has(extension)) {
		return 'spreadsheet';
	}
	if (TEXT_MIMES.has(mime) || TEXT_EXTENSIONS.has(extension)) {
		return 'text';
	}
	return null;
}

import {
	INBOUND_ATTACHMENT_MAX_BYTES,
	INBOUND_ATTACHMENT_MAX_CHARS,
	INBOUND_ATTACHMENT_MAX_CONCURRENT_PARSERS,
	INBOUND_ATTACHMENT_MAX_PDF_PAGES,
	INBOUND_ATTACHMENT_MAX_ROWS_PER_SHEET,
	INBOUND_ATTACHMENT_MAX_SHEETS,
	INBOUND_ATTACHMENT_PARSE_MEMORY_MB,
	INBOUND_ATTACHMENT_PARSE_TIMEOUT_MS,
	resolveInboundAttachmentKind,
	type InboundAttachmentKind
} from '@/lib/attachments/inbound-attachment-constraints';
import { Injectable } from '@nestjs/common';
import { Worker } from 'node:worker_threads';

/**
 * Outcome of trying to read one attachment. Every non-PARSED status is something the owner
 * should be told about — the point of surfacing them is that "we could not read the PDF"
 * must never look the same as "there was nothing in the PDF".
 *
 *  - EMPTY: parsed fine but no text layer — a scan, a photo, a drawing. Needs OCR we don't do.
 *  - ENCRYPTED: password-protected.
 */
export type AttachmentTextStatus = 'PARSED' | 'EMPTY' | 'UNSUPPORTED' | 'TOO_LARGE' | 'ENCRYPTED' | 'FAILED';

export interface AttachmentTextResult {
	status: AttachmentTextStatus;
	text: string | null;
	/** True when the file held more than we kept (page, row, sheet or character cap). */
	isTruncated: boolean;
}

export interface AttachmentTextInput {
	filename: string;
	mimeType: string;
	bytes: Buffer;
}

type ParsedKind = Exclude<InboundAttachmentKind, 'text'>;

const PDF_MAGIC = Buffer.from('%PDF-');
const ZIP_MAGIC = Buffer.from([0x50, 0x4b]);
// OLE2 compound file — the container for legacy .doc and .xls.
const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0]);

// Raw text admitted into normalization: 4x what we keep, so collapsing whitespace can still
// leave a full budget of real content.
const MAX_RAW_CHARS = INBOUND_ATTACHMENT_MAX_CHARS * 4;

const CODE_TAB = 9;
const CODE_LINE_FEED = 10;
const CODE_CARRIAGE_RETURN = 13;
const CODE_SPACE = 32;

type WorkerReply = { ok: true; text: string; isTruncated: boolean } | { ok: false; name: string; message: string };

/**
 * The parsing itself, run inside a worker thread. Plain CommonJS in a string (`eval: true`)
 * so there is no second build artefact to keep in step with `tsc` — the parent resolves
 * every module path and hands it over, because an eval'd worker has no useful module base.
 *
 * Why a worker at all, for files this small:
 *  1. Parsing is CPU-bound and the Inngest functions run INSIDE the API process. On the main
 *     thread a heavy PDF would stall every HTTP request until it finished.
 *  2. `terminate()` is a real timeout. A cooperative deadline can only fire between pages and
 *     does nothing about a parser stuck inside one.
 *  3. `resourceLimits` bounds memory. .docx and .xlsx are zip containers; a hostile one can
 *     expand to gigabytes, and these files come from anyone who can email the mailbox.
 *  4. pdf.js loads its own worker through a dynamic `import()`, which jest's VM sandbox
 *     refuses. A worker thread is a real Node context, so the REAL parser runs under test.
 */
const WORKER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads');
const { kind, bytes, paths, limits } = workerData;
// The bytes arrive TRANSFERRED (not cloned) as a dedicated Uint8Array: wrap, do not copy.
const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);

function cell(value) {
	if (value === null || value === undefined) return '';
	if (value instanceof Date) return value.toISOString().slice(0, 10);
	return String(value).trim();
}

async function pdf() {
	const { getDocumentProxy } = require(paths.unpdf);
	// pdf.js detaches whatever it is given; nothing else in this worker needs the bytes after.
	const document = await getDocumentProxy(bytes);
	const pagesToRead = Math.min(document.numPages, limits.maxPdfPages);
	// Page by page rather than extractText(): that helper always walks the WHOLE document,
	// and the page cap only means something if parsing actually stops at it.
	const pages = [];
	let collected = 0;
	for (let n = 1; n <= pagesToRead; n++) {
		const content = await (await document.getPage(n)).getTextContent();
		const text = content.items.map(i => ('str' in i ? i.str + (i.hasEOL ? '\\n' : ' ') : '')).join('');
		pages.push(text);
		collected += text.length;
		if (collected > limits.maxChars) break;
	}
	return { text: pages.join('\\n\\n'), isTruncated: document.numPages > pages.length };
}

async function docx() {
	const { value } = await require(paths.mammoth).extractRawText({ buffer });
	return { text: value, isTruncated: false };
}

async function doc() {
	const WordExtractor = require(paths.wordExtractor);
	const document = await new WordExtractor().extract(buffer);
	return { text: document.getBody(), isTruncated: false };
}

// Pipe-separated rows under a sheet heading: stuklijsten and price lists are tabular, and
// keeping row + column adjacency is what lets the model read "2 | stuks" as a quantity.
async function spreadsheet() {
	const XLSX = require(paths.xlsx);
	// sheetRows bounds what is PARSED, not just rendered. One extra row so a sheet that was
	// cut off can be told apart from one that simply ended there.
	const workbook = XLSX.read(buffer, { type: 'buffer', sheetRows: limits.maxRows + 1 });
	let isTruncated = workbook.SheetNames.length > limits.maxSheets;
	const blocks = [];
	for (const name of workbook.SheetNames.slice(0, limits.maxSheets)) {
		const sheet = workbook.Sheets[name];
		if (!sheet) continue;
		const rows = XLSX.utils
			.sheet_to_json(sheet, { header: 1, raw: false, defval: '' })
			.map(row => row.map(cell))
			.filter(cells => cells.some(c => c.length > 0));
		if (rows.length === 0) continue;
		if (rows.length > limits.maxRows) isTruncated = true;
		blocks.push('Blad: ' + name + '\\n' + rows.slice(0, limits.maxRows).map(c => c.join(' | ')).join('\\n'));
	}
	return { text: blocks.join('\\n\\n'), isTruncated };
}

({ pdf, docx, doc, spreadsheet })[kind]()
	// Bound the reply: a small zip can inflate to hundreds of MB of text, and whatever is posted
	// back gets structured-cloned onto the main thread.
	.then(result => parentPort.postMessage({
		ok: true,
		text: result.text.slice(0, limits.maxRawChars),
		isTruncated: result.isTruncated || result.text.length > limits.maxRawChars
	}))
	.catch(error => parentPort.postMessage({
		ok: false,
		name: (error && error.name) || 'Error',
		message: String((error && error.message) || error)
	}));
`;

/**
 * Turns an inbound attachment into plain text for the classifier + extractor.
 *
 * Text only, extracted locally: the file itself never leaves our infrastructure, which
 * keeps the provider-agnostic `AIClient` seam string-based and keeps the AVG position
 * simple ("we send the text of the request, never the document").
 *
 * An `@Injectable` rather than free functions so the pipeline can swap it in tests through
 * DI — this repo cannot `jest.mock` module functions (@swc/jest, see CLAUDE.md).
 */
@Injectable()
export class AttachmentTextExtractor {
	async extract(input: AttachmentTextInput): Promise<AttachmentTextResult> {
		if (input.bytes.length > INBOUND_ATTACHMENT_MAX_BYTES) {
			return { status: 'TOO_LARGE', text: null, isTruncated: false };
		}

		const kind = resolveInboundAttachmentKind(input.mimeType, input.filename);
		if (!kind) {
			return { status: 'UNSUPPORTED', text: null, isTruncated: false };
		}

		if (kind === 'text') {
			// Decode a bounded prefix only. UTF-8 is at most 4 bytes per character, so this can never
			// under-read the character budget — and a 10 MB text file never becomes a 10 MB string.
			const prefix = input.bytes.subarray(0, MAX_RAW_CHARS * 4);
			return finalize(prefix.toString('utf8'), prefix.length < input.bytes.length);
		}

		// Sniff before parsing: a `.pdf` filename on arbitrary bytes should never reach a parser.
		if (!hasExpectedMagic(kind, input.bytes)) {
			// A ".xls" that is neither zip nor OLE is almost always an HTML table exported by an ERP
			// system. That is a format we do not read, which is more honest than "corrupt".
			return { status: kind === 'spreadsheet' ? 'UNSUPPORTED' : 'FAILED', text: null, isTruncated: false };
		}

		const reply = await this.withParserSlot(() => this.parseInWorker(kind, input.bytes));
		if (!reply.ok) {
			// Malformed file, parser bug, timeout, or the memory limit. Deliberately not rethrown:
			// one unreadable attachment must never cost the owner the lead it arrived with.
			const isPasswordProtected = reply.name === 'PasswordException' || /password/i.test(reply.message);
			return { status: isPasswordProtected ? 'ENCRYPTED' : 'FAILED', text: null, isTruncated: false };
		}
		return finalize(reply.text, reply.isTruncated);
	}

	// `resourceLimits` bounds the worker's V8 HEAP only. Zip inflation and pdf.js buffers live
	// off-heap, where no per-worker limit exists — real memory isolation would need a child
	// process under an OS limit. What we CAN bound is how many parsers exist at once: the
	// pipeline processes several messages concurrently, and without this gate each of them could
	// be inflating a hostile archive at the same moment.
	private activeParsers = 0;
	private readonly waiting: Array<() => void> = [];

	private async withParserSlot<T>(run: () => Promise<T>): Promise<T> {
		if (this.activeParsers >= INBOUND_ATTACHMENT_MAX_CONCURRENT_PARSERS) {
			// The releaser hands its slot over WITHOUT touching the counter, so this waiter already
			// owns a slot when it resumes. Decrementing on release and re-incrementing here opened a
			// window in which a brand-new caller took the vacancy first — and then both ran.
			await new Promise<void>(resolve => this.waiting.push(resolve));
		} else {
			this.activeParsers += 1;
		}
		try {
			return await run();
		} finally {
			const next = this.waiting.shift();
			if (next) {
				next();
			} else {
				this.activeParsers -= 1;
			}
		}
	}

	private parseInWorker(kind: ParsedKind, bytes: Buffer): Promise<WorkerReply> {
		// One deliberate copy into a dedicated ArrayBuffer so it can be TRANSFERRED. A Node Buffer
		// may be a slice of the shared pool, which must never be transferred; and cloning instead
		// would hold two or three live copies of a 10 MB file per parse.
		const dedicated = new Uint8Array(bytes);
		return new Promise(resolve => {
			const worker = new Worker(WORKER_SOURCE, {
				eval: true,
				transferList: [dedicated.buffer],
				workerData: {
					kind,
					bytes: dedicated,
					paths: {
						unpdf: require.resolve('unpdf'),
						mammoth: require.resolve('mammoth'),
						wordExtractor: require.resolve('word-extractor'),
						// SheetJS comes from the vendor's CDN tarball, NOT the npm registry: the registry
						// copy is frozen at 0.18.5 with known prototype-pollution and ReDoS CVEs. Do not
						// "simplify" the dependency back to the registry version.
						xlsx: require.resolve('xlsx')
					},
					limits: {
						maxPdfPages: INBOUND_ATTACHMENT_MAX_PDF_PAGES,
						maxChars: INBOUND_ATTACHMENT_MAX_CHARS,
						maxSheets: INBOUND_ATTACHMENT_MAX_SHEETS,
						maxRows: INBOUND_ATTACHMENT_MAX_ROWS_PER_SHEET,
						maxRawChars: MAX_RAW_CHARS
					}
				},
				resourceLimits: { maxOldGenerationSizeMb: INBOUND_ATTACHMENT_PARSE_MEMORY_MB },
				// A parser has no business reading our secrets, and its console noise should not
				// bypass LogService by going straight to the process streams.
				env: {},
				stdout: true,
				stderr: true
			});

			let isSettled = false;
			const settle = (reply: WorkerReply) => {
				if (isSettled) {
					return;
				}
				isSettled = true;
				clearTimeout(timer);
				// Resolve only once the thread is actually gone: the caller releases its parser slot
				// on resolve, and a worker still tearing down still holds its memory.
				void worker.terminate().then(
					() => resolve(reply),
					() => resolve(reply)
				);
			};

			const timer = setTimeout(
				() => settle({ ok: false, name: 'ParseTimeout', message: 'parse deadline exceeded' }),
				INBOUND_ATTACHMENT_PARSE_TIMEOUT_MS
			);
			worker.once('message', (reply: WorkerReply) => settle(reply));
			// Includes ERR_WORKER_OUT_OF_MEMORY when `resourceLimits` trips.
			worker.once('error', error => settle({ ok: false, name: error.name, message: error.message }));
			worker.once('exit', code =>
				settle({ ok: false, name: 'WorkerExit', message: `worker exited with ${code}` })
			);
		});
	}
}

function hasExpectedMagic(kind: ParsedKind, bytes: Buffer): boolean {
	const isZip = bytes.subarray(0, 2).equals(ZIP_MAGIC);
	const isOle = bytes.subarray(0, 4).equals(OLE_MAGIC);
	switch (kind) {
		case 'pdf':
			return bytes.subarray(0, 1024).includes(PDF_MAGIC);
		case 'docx':
			return isZip;
		case 'doc':
			return isOle;
		case 'spreadsheet':
			return isZip || isOle;
	}
}

function finalize(raw: string, isAlreadyTruncated: boolean): AttachmentTextResult {
	// Bound BEFORE normalizing: `normalize` walks the string on the main thread, so it must never
	// see more than a small multiple of what we keep. The slack leaves room for the whitespace
	// that normalizing collapses.
	const isRawOverBudget = raw.length > MAX_RAW_CHARS;
	const text = normalize(isRawOverBudget ? raw.slice(0, MAX_RAW_CHARS) : raw);
	if (text.length === 0) {
		return { status: 'EMPTY', text: null, isTruncated: false };
	}
	const isOverBudget = text.length > INBOUND_ATTACHMENT_MAX_CHARS;
	return {
		status: 'PARSED',
		text: isOverBudget ? text.slice(0, INBOUND_ATTACHMENT_MAX_CHARS) : text,
		isTruncated: isAlreadyTruncated || isOverBudget || isRawOverBudget
	};
}

// The NUL character is legal in text extracted from a PDF and ILLEGAL in a Postgres `text`
// column — left in, one odd PDF would fail the whole insert. The remaining C0 controls are
// noise. Done by char code rather than a regex so the source holds no control-character
// escapes (they do not survive every toolchain intact).
function isKeptCharacter(character: string): boolean {
	const code = character.charCodeAt(0);
	return code >= CODE_SPACE || code === CODE_TAB || code === CODE_LINE_FEED || code === CODE_CARRIAGE_RETURN;
}

function normalize(value: string): string {
	return Array.from(value)
		.filter(isKeptCharacter)
		.join('')
		.replace(/\r\n/g, '\n')
		.replace(/[ \t]+/g, ' ')
		.replace(/[ \t]*\n[ \t]*/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

import {
	INBOUND_ATTACHMENT_MAX_TOTAL_CHARS,
	resolveInboundAttachmentKind
} from '@/lib/attachments/inbound-attachment-constraints';

/**
 * The decisions about attachments that are pure logic, kept here — outside any service — so
 * the production pipeline and the live-AI accuracy harness (`pnpm test:ai:attachments`)
 * execute the SAME code. A harness that re-implemented them would happily keep passing while
 * the pipeline drifted.
 */

/**
 * A body this short cannot carry a job description on its own. With a readable document
 * attached, a negative classification gets a second look with the attachment text included.
 */
export const THIN_BODY_MAX_CHARS = 400;

const BLOCK_SEPARATOR = '\n\n';
const BLOCK_HEADER_PREFIX = '=== Bijlage: ';

/**
 * Filenames that announce a document which is NOT a request for a quote. The rescue reads the
 * attachment of a mail it is unsure about and sends its text to the AI provider; an SMB inbox is
 * full of two-line mails carrying invoices, payslips and delivery notes, and none of those should
 * be downloaded, parsed and shipped off on the strength of a short body. Matched on the filename
 * only — cheap, and it errs towards NOT reading.
 */
const NON_REQUEST_FILENAME =
	/(factuur|invoice|creditnota|credit[-_ ]?note|pakbon|vrachtbrief|loonstrook|salaris|jaaropgave|bankafschrift|afschrift|aanmaning|herinnering|orderbevestiging|order[-_ ]?confirmation|polis|algemene[-_ ]?voorwaarden)/i;

/**
 * Should a message the classifier just rejected be re-classified with its attachment text?
 * Only when that could change the verdict: it was negative, the body is too thin to have
 * carried the request, and at least one attachment is a readable document that does not
 * announce itself as an invoice or similar.
 *
 * Deliberately NOT keyed on the classifier's `confidence` — that number is self-reported by
 * the model and uncalibrated, so any threshold on it would be arbitrary.
 */
export function isAttachmentRescueCandidate(input: {
	isQuote: boolean;
	bodyLength: number;
	attachments: ReadonlyArray<{ filename: string; mimeType: string }>;
}): boolean {
	return (
		!input.isQuote &&
		input.bodyLength <= THIN_BODY_MAX_CHARS &&
		input.attachments.some(
			a => resolveInboundAttachmentKind(a.mimeType, a.filename) !== null && !NON_REQUEST_FILENAME.test(a.filename)
		)
	);
}

/**
 * Assemble the text of several parsed attachments into the single string the prompts receive.
 * Each file is headed by its filename so the model can tell "the stuklijst says" from "the
 * bestek says".
 *
 * FAIR SHARE, not first-come: every file is guaranteed `budget / n`, and whatever the short
 * files leave unused is handed to the long ones in order. First-come let a 20k-character
 * `Algemene_voorwaarden.pdf` swallow the entire budget while the stuklijst that actually held
 * the request got nothing — and the UI still said "Gelezen door Offertum" for it.
 *
 * Whole blocks are budgeted — header and separator included — so the assembled string can
 * never exceed `budget` and the prompt's own slice can never cut the tail off the last file.
 */
export function formatAttachmentBlocks(
	parsed: ReadonlyArray<{ filename: string; text: string | null }>,
	budget: number = INBOUND_ATTACHMENT_MAX_TOTAL_CHARS
): string | null {
	const files = parsed.filter((file): file is { filename: string; text: string } => !!file.text);
	if (files.length === 0) {
		return null;
	}

	const headers = files.map(file => `${BLOCK_HEADER_PREFIX}${file.filename} ===\n`);
	const overhead =
		headers.reduce((sum, header) => sum + header.length, 0) + BLOCK_SEPARATOR.length * (files.length - 1);
	const textBudget = budget - overhead;
	if (textBudget <= 0) {
		return null;
	}

	// Pass 1: everyone gets up to an equal share. Pass 2: hand the unused remainder out in order.
	const share = Math.floor(textBudget / files.length);
	const allocation = files.map(file => Math.min(file.text.length, share));
	let spare = textBudget - allocation.reduce((sum, chars) => sum + chars, 0);
	for (let i = 0; i < files.length && spare > 0; i++) {
		const extra = Math.min(files[i]!.text.length - allocation[i]!, spare);
		allocation[i]! += extra;
		spare -= extra;
	}

	return files.map((file, i) => headers[i]! + file.text.slice(0, allocation[i])).join(BLOCK_SEPARATOR);
}

/**
 * A shorter cut of already-assembled attachment text, for a prompt with a smaller budget (the
 * classifier only has to decide, not to read). Re-balances per file rather than slicing the
 * front off the string, which would show the classifier the first file only — and miss the
 * request whenever it sits in the second one.
 */
export function excerptAttachmentBlocks(attachmentText: string | null, budget: number): string | null {
	if (!attachmentText) {
		return null;
	}
	if (attachmentText.length <= budget) {
		return attachmentText;
	}
	const files = attachmentText
		.split(`${BLOCK_SEPARATOR}${BLOCK_HEADER_PREFIX}`)
		.map((block, i) => (i === 0 ? block : BLOCK_HEADER_PREFIX + block))
		.map(block => {
			const newline = block.indexOf('\n');
			const header = block.slice(0, newline);
			return {
				filename: header.slice(BLOCK_HEADER_PREFIX.length, -' ==='.length),
				text: block.slice(newline + 1)
			};
		});
	return formatAttachmentBlocks(files, budget);
}

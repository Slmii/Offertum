/**
 * Limits + MIME allowlist for reply-draft attachments. Centralized so the controller
 * (file-size guard), service (per-draft total guard), and send-path (provider envelope
 * cap) all reference the same numbers.
 *
 * Caps are tuned to the lowest provider ceiling: Gmail rejects raw payloads above
 * ~25 MB, Microsoft Graph's `/me/sendMail` accepts ~35 MB for the JSON envelope. We
 * pick 25 MB as the cross-provider safe total — base64 inflation (≈4/3) is included
 * in the budget by checking the raw byte total against this cap (the encoded payload
 * is ~33 MB at the limit, still under Graph's, and Gmail's ~25 MB applies to raw bytes
 * pre-encode so we're fine).
 */

/** Per-file ceiling. PDFs of 15-20 MB are realistic for inspection reports. */
export const ATTACHMENT_MAX_FILE_BYTES = 20 * 1024 * 1024;

/** Combined raw-byte total across all attachments on one draft. */
export const ATTACHMENT_MAX_TOTAL_BYTES = 25 * 1024 * 1024;

/** Hard cap on attachment count per draft. Above this, the UI gets unwieldy fast. */
export const ATTACHMENT_MAX_PER_DRAFT = 10;

/**
 * MIME types we accept on upload. Conservative: PDFs + common Office formats + common
 * image formats + plain text. Adding a type later is a one-line change here; removing
 * one needs a backfill story for any rows already persisted (today: none yet).
 */
export const ATTACHMENT_ALLOWED_MIME_TYPES = new Set<string>([
	'application/pdf',
	'image/png',
	'image/jpeg',
	'image/webp',
	'image/gif',
	'application/msword',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'application/vnd.ms-excel',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	'application/vnd.ms-powerpoint',
	'application/vnd.openxmlformats-officedocument.presentationml.presentation',
	'text/plain',
	'text/csv',
	'application/zip'
]);

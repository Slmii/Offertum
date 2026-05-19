/**
 * Storage abstraction for reply-draft attachments.
 *
 * The DI token (`ATTACHMENT_STORAGE`) is bound in `AttachmentStorageModule` to a driver
 * implementation picked from `ATTACHMENT_STORAGE_DRIVER`. Today: `local` (filesystem
 * under `apps/api/.attachments/`). Tomorrow: `spaces` (DigitalOcean Spaces, S3 v3 SDK)
 * — one new file implementing this same interface, one line in the module to bind it.
 *
 * Contract notes:
 *  - `storageKey` is the driver's opaque pointer. Callers never construct it manually;
 *    the service-layer generates a UUID-prefixed key on upload and stores it in the
 *    `ReplyDraftAttachment` row. Persisting the key lets us swap drivers later without
 *    re-deriving paths.
 *  - `put` returns the persisted key so the caller can persist it as-is. The driver may
 *    transform the input key (e.g. add a prefix); the returned key is canonical.
 *  - `get` returns a Buffer + contentType. We don't stream today: max attachment size
 *    is 20 MB which fits comfortably in memory, and the send path needs the bytes
 *    fully buffered for base64 encoding into the RFC 2822 / Graph payload anyway.
 *  - `delete` is idempotent: a missing key resolves successfully.
 */

export const ATTACHMENT_STORAGE = Symbol('ATTACHMENT_STORAGE');

export type AttachmentStorageDriver = 'local' | 'spaces';

export interface AttachmentStoragePutInput {
	storageKey: string;
	data: Buffer;
	contentType: string;
}

export interface AttachmentStorageReadResult {
	data: Buffer;
	contentType: string;
}

export interface AttachmentStorage {
	readonly driver: AttachmentStorageDriver;
	put(input: AttachmentStoragePutInput): Promise<{ storageKey: string }>;
	get(storageKey: string): Promise<AttachmentStorageReadResult>;
	delete(storageKey: string): Promise<void>;
}

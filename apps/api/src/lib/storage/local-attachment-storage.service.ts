import type { EnvSchema } from '@/config/env.schema';
import { LogService } from '@/modules/logger/log.service';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import type {
	AttachmentStorage,
	AttachmentStoragePutInput,
	AttachmentStorageReadResult
} from '@/lib/storage/attachment-storage.interface';

/**
 * Filesystem-backed implementation of `AttachmentStorage`. Writes one file per
 * attachment under `<ATTACHMENT_STORAGE_LOCAL_DIR>/<storageKey>`.
 *
 * Each file is accompanied by a `<file>.contenttype` sidecar that records the original
 * MIME type — needed because the local filesystem doesn't preserve it, and we want
 * `get()` to surface the same `contentType` the upload produced (the send path uses
 * it for the MIME envelope, and the download endpoint uses it as the Content-Type
 * response header).
 *
 * Path safety: `storageKey` is generated server-side via `randomUUID()` + the
 * sanitized original filename, so it's already free of `..` segments. We still
 * normalize + verify containment in `resolveSafePath()` as defense in depth — a
 * future caller passing a user-controlled key would otherwise risk path traversal.
 */
@Injectable()
export class LocalAttachmentStorage implements AttachmentStorage {
	readonly driver = 'local' as const;
	private readonly rootDir: string;

	constructor(
		private readonly config: ConfigService<EnvSchema, true>,
		private readonly logService: LogService
	) {
		const configured = this.config.get('ATTACHMENT_STORAGE_LOCAL_DIR', { infer: true });
		this.rootDir = isAbsolute(configured) ? resolve(configured) : resolve(process.cwd(), configured);
	}

	async put(input: AttachmentStoragePutInput): Promise<{ storageKey: string }> {
		const fullPath = this.resolveSafePath(input.storageKey);
		await mkdir(dirname(fullPath), { recursive: true });
		await writeFile(fullPath, input.data);
		// Sidecar — keeps the contentType round-trippable across `put` → `get` without a
		// DB lookup. Tiny file (a few dozen bytes); negligible overhead.
		await writeFile(`${fullPath}.contenttype`, input.contentType, 'utf-8');

		this.logService.logAction({
			action: 'attachment.storage.local.put',
			message: `Local attachment stored: ${input.storageKey}`,
			metadata: {
				storageKey: input.storageKey,
				sizeBytes: input.data.byteLength,
				contentType: input.contentType
			},
			context: 'LocalAttachmentStorage'
		});

		return { storageKey: input.storageKey };
	}

	async get(storageKey: string): Promise<AttachmentStorageReadResult> {
		const fullPath = this.resolveSafePath(storageKey);
		const [data, contentTypeRaw] = await Promise.all([
			readFile(fullPath),
			readFile(`${fullPath}.contenttype`, 'utf-8').catch(() => 'application/octet-stream')
		]);
		return { data, contentType: contentTypeRaw.trim() || 'application/octet-stream' };
	}

	async delete(storageKey: string): Promise<void> {
		const fullPath = this.resolveSafePath(storageKey);
		// `force: true` makes the call idempotent — a missing file resolves silently
		// instead of throwing ENOENT. Matches the spaces-driver contract where deleting
		// a missing object is also a success.
		await Promise.all([rm(fullPath, { force: true }), rm(`${fullPath}.contenttype`, { force: true })]);
	}

	/**
	 * Compose the absolute on-disk path for `storageKey` and verify it lives under the
	 * configured root. Defense in depth against any future caller that wires
	 * user-supplied input into the key.
	 */
	private resolveSafePath(storageKey: string): string {
		const fullPath = resolve(this.rootDir, storageKey);
		const relativeToRoot = relative(this.rootDir, fullPath);
		if (relativeToRoot.startsWith('..') || isAbsolute(relativeToRoot)) {
			throw new Error(`Refusing to write outside attachment root: ${storageKey}`);
		}
		return fullPath;
	}
}

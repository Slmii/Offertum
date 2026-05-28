import type { EnvSchema } from '@/config/env.schema';
import { LocalAttachmentStorage } from '@/lib/storage/local-attachment-storage.service';
import type { LogService } from '@/modules/logger/log.service';
import type { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('LocalAttachmentStorage', () => {
	let rootDir: string;
	let siblingDir: string;

	beforeEach(async () => {
		rootDir = await mkdtemp(join(tmpdir(), 'offertum-attachments-root-'));
		siblingDir = `${rootDir}-evil`;
	});

	afterEach(async () => {
		await Promise.all([
			rm(rootDir, { recursive: true, force: true }),
			rm(siblingDir, { recursive: true, force: true })
		]);
	});

	it('rejects traversal into sibling directories whose names share the root prefix', async () => {
		const storage = new LocalAttachmentStorage(
			makeConfig(rootDir),
			{ logAction: jest.fn() } as unknown as LogService
		);

		await expect(
			storage.put({
				storageKey: `../${siblingDir.split('/').at(-1)}/payload.txt`,
				data: Buffer.from('owned'),
				contentType: 'text/plain'
			})
		).rejects.toThrow('Refusing to write outside attachment root');
	});
});

function makeConfig(rootDir: string): ConfigService<EnvSchema, true> {
	return {
		get: jest.fn().mockReturnValue(rootDir)
	} as unknown as ConfigService<EnvSchema, true>;
}

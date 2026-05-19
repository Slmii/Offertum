import type { EnvSchema } from '@/config/env.schema';
import { ATTACHMENT_STORAGE } from '@/lib/storage/attachment-storage.interface';
import { LocalAttachmentStorage } from '@/lib/storage/local-attachment-storage.service';
import { Global, Module, type FactoryProvider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * `@Global` so any module can `@Inject(ATTACHMENT_STORAGE)` without re-importing.
 *
 * `useFactory` instead of `useExisting` because we want the driver picked at boot
 * (one source of truth = the env var), not at every injection site. Picking `spaces`
 * before the bucket is wired throws here — fail-fast beats discovering the broken
 * binding when the first user clicks Upload.
 */
const attachmentStorageProvider: FactoryProvider = {
	provide: ATTACHMENT_STORAGE,
	useFactory: (config: ConfigService<EnvSchema, true>, local: LocalAttachmentStorage) => {
		const driver = config.get('ATTACHMENT_STORAGE_DRIVER', { infer: true });
		if (driver === 'local') {
			return local;
		}
		// `spaces` is the only other valid value per the Zod schema, but the implementation
		// hasn't landed. Better to throw at boot than to silently fall back to local —
		// silent fallback is how customer files end up on a developer laptop in prod.
		throw new Error(
			`ATTACHMENT_STORAGE_DRIVER='${driver}' is not implemented yet. ` +
				`Set ATTACHMENT_STORAGE_DRIVER=local for development, or wire the missing driver.`
		);
	},
	inject: [ConfigService, LocalAttachmentStorage]
};

@Global()
@Module({
	providers: [LocalAttachmentStorage, attachmentStorageProvider],
	exports: [ATTACHMENT_STORAGE]
})
export class AttachmentStorageModule {}

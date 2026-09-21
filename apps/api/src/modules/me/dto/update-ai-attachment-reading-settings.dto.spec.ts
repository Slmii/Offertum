import { UpdateAiAttachmentReadingSettingsDto } from '@/modules/me/dto/update-ai-attachment-reading-settings.dto';
import { ValidationPipe } from '@nestjs/common';

// Same options as main.ts — the bug only exists in combination with enableImplicitConversion.
const pipe = new ValidationPipe({
	whitelist: true,
	forbidNonWhitelisted: true,
	transform: true,
	transformOptions: { enableImplicitConversion: true }
});
const run = (body: unknown) =>
	pipe.transform(body, {
		type: 'body',
		metatype: UpdateAiAttachmentReadingSettingsDto
	}) as Promise<UpdateAiAttachmentReadingSettingsDto>;

describe('UpdateAiAttachmentReadingSettingsDto', () => {
	it('accepts real booleans', async () => {
		await expect(run({ enabled: false })).resolves.toMatchObject({ enabled: false });
		await expect(run({ enabled: true })).resolves.toMatchObject({ enabled: true });
	});

	// Regression (audit): implicit conversion turned the string "false" into `true` BEFORE
	// validation ran. For a privacy switch that is the worst direction to be wrong in.
	it.each([
		['"false"', 'false'],
		['"true"', 'true'],
		['1', 1],
		['0', 0],
		['{}', {}],
		['null', null]
	])('rejects %s instead of coercing it', async (_label, value) => {
		await expect(run({ enabled: value })).rejects.toThrow();
	});
});

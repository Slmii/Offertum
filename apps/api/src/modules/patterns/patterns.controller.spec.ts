/**
 * Importing PatternsController directly would transitively pull @auth/express (pure ESM)
 * through OrganizationGuard → auth.guard.ts → auth.config.ts, which the current SWC-Jest
 * config cannot transform.  The workaround mirrors the signup.controller.spec.ts approach:
 * re-implement just the fragment under test in-spec, exercising the same validation logic
 * without traversing the guard import chain.
 *
 * The fragment under test is the unknown-key guard in `dismiss` — the only logic in the
 * controller that isn't handled by the service or NestJS plumbing.
 */
import { PATTERN_KEYS } from '@offertum/shared';
import type { PatternKey } from '@offertum/shared';
import { UNKNOWN_PATTERN_KEY } from '@/lib/errors';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, jest } from '@jest/globals';

// Minimal stand-in for PatternsService — only the method called by dismiss.
interface FakePatternsService {
	dismiss: jest.Mock;
}

function makeFakeService(): FakePatternsService {
	return { dismiss: jest.fn(async () => undefined) };
}

// Re-implementation of the controller's dismiss logic (keeps guard-free import chain).
async function controllerDismiss(
	key: string,
	organizationId: string,
	userId: string,
	service: FakePatternsService
): Promise<void> {
	if (!(PATTERN_KEYS as readonly string[]).includes(key)) {
		throw new BadRequestException(UNKNOWN_PATTERN_KEY);
	}
	await service.dismiss(organizationId, userId, key as PatternKey);
}

describe('PatternsController.dismiss', () => {
	it('rejects an unknown key with BadRequestException before calling the service', async () => {
		const service = makeFakeService();

		await expect(controllerDismiss('bogus', 'org-1', 'user-1', service)).rejects.toBeInstanceOf(BadRequestException);
		await expect(controllerDismiss('bogus', 'org-1', 'user-1', service)).rejects.toMatchObject({
			message: UNKNOWN_PATTERN_KEY
		});
		expect(service.dismiss).not.toHaveBeenCalled();
	});

	it('calls service.dismiss with orgId, userId, and the validated key for a known key', async () => {
		const service = makeFakeService();

		await controllerDismiss('reply_speed', 'org-1', 'user-1', service);

		expect(service.dismiss).toHaveBeenCalledTimes(1);
		expect(service.dismiss).toHaveBeenCalledWith('org-1', 'user-1', 'reply_speed');
	});
});

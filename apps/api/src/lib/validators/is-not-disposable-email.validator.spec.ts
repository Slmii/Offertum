import { IsNotDisposableEmail } from '@/lib/validators/is-not-disposable-email.validator';
import { describe, expect, it } from '@jest/globals';
import { IsEmail, validate } from 'class-validator';

class TestDto {
	@IsEmail()
	@IsNotDisposableEmail()
	email!: string;
}

async function validateEmail(value: unknown): Promise<string[]> {
	const dto = new TestDto();
	(dto as { email: unknown }).email = value;
	const errors = await validate(dto);
	return errors.flatMap(e => Object.values(e.constraints ?? {}));
}

describe('IsNotDisposableEmail', () => {
	it('accepts a regular work email', async () => {
		expect(await validateEmail('alice@quoteom.dev')).toEqual([]);
	});

	it('accepts uppercased domains (case-insensitive)', async () => {
		expect(await validateEmail('alice@QUOTEOM.DEV')).toEqual([]);
	});

	it('rejects mailinator.com', async () => {
		const errors = await validateEmail('burner@mailinator.com');
		expect(errors).toContain('Disposable email addresses are not allowed. Please use a work email.');
	});

	it('rejects 10minutemail.com', async () => {
		const errors = await validateEmail('temp@10minutemail.com');
		expect(errors).toContain('Disposable email addresses are not allowed. Please use a work email.');
	});

	it('rejects uppercased disposable domains', async () => {
		const errors = await validateEmail('temp@MAILINATOR.COM');
		expect(errors).toContain('Disposable email addresses are not allowed. Please use a work email.');
	});

	it('rejects a subdomain match exactly — does NOT treat random subdomain as disposable', async () => {
		// `mailinator.com` is on the list but `example.com` is not — `support@example.com`
		// must pass. This guards against an over-eager substring match in the validator.
		expect(await validateEmail('support@example.com')).toEqual([]);
	});

	it('does not flag empty string itself (IsEmail handles that)', async () => {
		// IsEmail already rejects empty; IsNotDisposableEmail must not add a second false-positive.
		const errors = await validateEmail('');
		expect(errors).not.toContain('Disposable email addresses are not allowed. Please use a work email.');
	});

	it('does not flag malformed strings without an @ (IsEmail handles that)', async () => {
		const errors = await validateEmail('not-an-email');
		expect(errors).not.toContain('Disposable email addresses are not allowed. Please use a work email.');
	});

	it('does not flag non-string values (IsEmail handles that)', async () => {
		const errors = await validateEmail(12345);
		expect(errors).not.toContain('Disposable email addresses are not allowed. Please use a work email.');
	});
});

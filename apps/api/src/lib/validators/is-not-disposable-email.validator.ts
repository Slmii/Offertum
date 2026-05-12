import { DISPOSABLE_EMAIL_NOT_ALLOWED } from '@/lib/errors';
import { registerDecorator, type ValidationOptions } from 'class-validator';
import disposableDomains from 'disposable-email-domains';

// Build once at module-load. The package ships a JSON array (~2k entries); converting to
// a Set makes the per-request check O(1) instead of O(n).
const disposableSet = new Set<string>(disposableDomains.map(d => d.toLowerCase()));

/**
 * Rejects email addresses whose domain is on a community-maintained list of throwaway
 * services (Mailinator, 10minutemail, etc.). Use alongside `@IsEmail()` — this validator
 * assumes the value is a syntactically-valid email and only checks the domain.
 *
 * The list is bundled, not fetched — no runtime network call, no service dependency.
 * It's not exhaustive (new throwaway services pop up constantly) but covers the top
 * ~99% of automated-abuse traffic.
 */
export function IsNotDisposableEmail(validationOptions?: ValidationOptions) {
	return function (object: object, propertyName: string) {
		registerDecorator({
			name: 'IsNotDisposableEmail',
			target: object.constructor,
			propertyName,
			options: {
				message: DISPOSABLE_EMAIL_NOT_ALLOWED,
				...validationOptions
			},
			validator: {
				validate(value: unknown): boolean {
					if (typeof value !== 'string') {
						return true; // let @IsEmail handle non-strings
					}
					const at = value.lastIndexOf('@');
					if (at < 0) {
						return true; // let @IsEmail handle malformed
					}
					const domain = value.slice(at + 1).toLowerCase();
					return !disposableSet.has(domain);
				}
			}
		});
	};
}

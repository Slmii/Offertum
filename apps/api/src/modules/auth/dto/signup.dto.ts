import type { SignupInput } from '@offertum/shared';
import { IsNotDisposableEmail } from '@/lib/validators/is-not-disposable-email.validator';
import { NON_WHITESPACE_MESSAGE, NON_WHITESPACE_PATTERN } from '@/lib/validators/non-whitespace-pattern';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class SignupDto implements SignupInput {
	@IsEmail()
	@IsNotDisposableEmail()
	email!: string;

	@IsString()
	@MinLength(2)
	@MaxLength(100)
	@Matches(NON_WHITESPACE_PATTERN, { message: `companyName ${NON_WHITESPACE_MESSAGE}` })
	companyName!: string;
}

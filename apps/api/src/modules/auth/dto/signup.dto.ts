import { IsNotDisposableEmail } from '@/lib/validators/is-not-disposable-email.validator';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class SignupDto {
	@IsEmail()
	@IsNotDisposableEmail()
	email!: string;

	@IsString()
	@MinLength(2)
	@MaxLength(100)
	companyName!: string;
}

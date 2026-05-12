export class SignupResponseDto {
	ok!: boolean;
	/** Normalized email — pass this to the Auth.js signin/resend call to trigger the magic link. */
	email!: string;
}

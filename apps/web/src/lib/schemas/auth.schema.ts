import z from 'zod';

export const SignInSchema = z.object({
	email: z.string().email('Please enter a valid email address')
});

export type SignInForm = z.infer<typeof SignInSchema>;

export const SignUpSchema = z.object({
	email: z.string().email('Please enter a valid email address'),
	companyName: z
		.string()
		.min(2, 'Company name must be at least 2 characters')
		.max(100, 'Company name must be 100 characters or fewer')
});

export type SignUpForm = z.infer<typeof SignUpSchema>;

export const AcceptInviteSearchSchema = z.object({
	token: z.string().min(1)
});

export const VerifyRequestSearchSchema = z.object({
	email: z.string().optional()
});

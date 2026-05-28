import { SignupDto } from '@/modules/auth/dto/signup.dto';
import { validate } from 'class-validator';
import { describe, expect, it } from '@jest/globals';

describe('SignupDto', () => {
	it('rejects whitespace-only company names before signup service trimming', async () => {
		const dto = new SignupDto();
		dto.email = 'founder@offertum.dev';
		dto.companyName = '   ';

		const errors = await validate(dto);

		expect(errors).toEqual(expect.arrayContaining([expect.objectContaining({ property: 'companyName' })]));
	});
});

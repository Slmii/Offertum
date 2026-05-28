import { UpdateBusinessDetailsDto } from '@/modules/me/dto/update-business-details.dto';
import { validate } from 'class-validator';
import { describe, expect, it } from '@jest/globals';

describe('UpdateBusinessDetailsDto', () => {
	it('rejects whitespace-only organization names before service trimming', async () => {
		const dto = new UpdateBusinessDetailsDto();
		dto.name = '   ';

		const errors = await validate(dto);

		expect(errors).toEqual(expect.arrayContaining([expect.objectContaining({ property: 'name' })]));
	});
});

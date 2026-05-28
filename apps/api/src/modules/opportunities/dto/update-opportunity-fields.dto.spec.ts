import { UpdateOpportunityFieldsDto } from '@/modules/opportunities/dto/update-opportunity-fields.dto';
import { validate } from 'class-validator';
import { describe, expect, it } from '@jest/globals';

describe('UpdateOpportunityFieldsDto', () => {
	it('rejects impossible calendar dates before Date normalization can shift them', async () => {
		const dto = new UpdateOpportunityFieldsDto();
		dto.customerDeadline = '2026-02-31';
		dto.customerAppointment = '2026-04-31T10:00:00.000Z';

		const errors = await validate(dto);

		expect(errors.map(error => error.property).sort()).toEqual(['customerAppointment', 'customerDeadline']);
	});
});

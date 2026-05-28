import { validate } from 'class-validator';
import { describe, expect, it } from '@jest/globals';

import { CreateCatalogItemDto } from '@/modules/catalog-items/dto/create-catalog-item.dto';
import { UpdateCatalogItemDto } from '@/modules/catalog-items/dto/update-catalog-item.dto';

describe('catalog item price validation', () => {
	it('rejects whitespace-only names before service normalization can store an empty value', async () => {
		const createDto = new CreateCatalogItemDto();
		createDto.name = '   ';
		createDto.defaultPriceEur = '10.00';
		createDto.defaultVatRate = 21;

		const updateDto = new UpdateCatalogItemDto();
		updateDto.name = '   ';

		const [createErrors, updateErrors] = await Promise.all([validate(createDto), validate(updateDto)]);

		expect(createErrors).toEqual(expect.arrayContaining([expect.objectContaining({ property: 'name' })]));
		expect(updateErrors).toEqual(expect.arrayContaining([expect.objectContaining({ property: 'name' })]));
	});

	it('accepts the maximum value supported by Decimal(10, 2)', async () => {
		const dto = new CreateCatalogItemDto();
		dto.name = 'Installatie';
		dto.defaultPriceEur = '99999999.99';
		dto.defaultVatRate = 21;

		await expect(validate(dto)).resolves.toHaveLength(0);
	});

	it('rejects create payloads above the Decimal(10, 2) range before Prisma sees them', async () => {
		const dto = new CreateCatalogItemDto();
		dto.name = 'Installatie';
		dto.defaultPriceEur = '100000000.00';
		dto.defaultVatRate = 21;

		const errors = await validate(dto);

		expect(errors).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					property: 'defaultPriceEur'
				})
			])
		);
	});

	it('rejects update payloads above the Decimal(10, 2) range before Prisma sees them', async () => {
		const dto = new UpdateCatalogItemDto();
		dto.defaultPriceEur = '100000000.00';

		const errors = await validate(dto);

		expect(errors).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					property: 'defaultPriceEur'
				})
			])
		);
	});
});

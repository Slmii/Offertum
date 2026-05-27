import { CATALOG_ITEM_NOT_FOUND } from '@/lib/errors';
import { CatalogItemsRepository, type CatalogItemRow } from '@/modules/catalog-items/catalog-items.repository';
import {
	CatalogItemListResponseDto,
	CatalogItemResponseDto
} from '@/modules/catalog-items/dto/catalog-item.response.dto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { CATALOG_ITEM_UNIT_DEFAULT, type CatalogItemUnit } from '@offertum/shared';

@Injectable()
export class CatalogItemsService {
	constructor(private readonly repository: CatalogItemsRepository) {}

	async list(organizationId: string): Promise<CatalogItemListResponseDto> {
		const rows = await this.repository.listForOrganization(organizationId);
		return { items: rows.map(toResponseDto) };
	}

	async create(
		organizationId: string,
		input: {
			name: string;
			description?: string | null;
			defaultPriceEur: string;
			defaultVatRate: number;
			sku?: string | null;
			unit?: CatalogItemUnit;
			active?: boolean;
		}
	): Promise<CatalogItemResponseDto> {
		const row = await this.repository.create({
			organizationId,
			name: input.name.trim(),
			description: normalizeNullable(input.description),
			defaultPriceEur: input.defaultPriceEur,
			defaultVatRate: input.defaultVatRate,
			sku: normalizeNullable(input.sku),
			unit: input.unit ?? CATALOG_ITEM_UNIT_DEFAULT,
			active: input.active ?? true
		});
		return toResponseDto(row);
	}

	async update(
		organizationId: string,
		id: string,
		patch: {
			name?: string;
			description?: string | null;
			defaultPriceEur?: string;
			defaultVatRate?: number;
			sku?: string | null;
			unit?: CatalogItemUnit;
			active?: boolean;
		}
	): Promise<CatalogItemResponseDto> {
		const existing = await this.repository.findByIdForOrganization(organizationId, id);
		if (!existing) {
			throw new NotFoundException(CATALOG_ITEM_NOT_FOUND);
		}
		const row = await this.repository.update(id, {
			...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
			...(patch.description !== undefined ? { description: normalizeNullable(patch.description) } : {}),
			...(patch.defaultPriceEur !== undefined ? { defaultPriceEur: patch.defaultPriceEur } : {}),
			...(patch.defaultVatRate !== undefined ? { defaultVatRate: patch.defaultVatRate } : {}),
			...(patch.sku !== undefined ? { sku: normalizeNullable(patch.sku) } : {}),
			...(patch.unit !== undefined ? { unit: patch.unit } : {}),
			...(patch.active !== undefined ? { active: patch.active } : {})
		});
		return toResponseDto(row);
	}

	async delete(organizationId: string, id: string): Promise<void> {
		const existing = await this.repository.findByIdForOrganization(organizationId, id);
		if (!existing) {
			throw new NotFoundException(CATALOG_ITEM_NOT_FOUND);
		}
		await this.repository.delete(id);
	}
}

/** Trim + treat empty strings as `null` so the DB never stores `""`. */
function normalizeNullable(value: string | null | undefined): string | null {
	if (value === undefined || value === null) {
		return null;
	}
	const trimmed = value.trim();
	return trimmed.length === 0 ? null : trimmed;
}

function toResponseDto(row: CatalogItemRow): CatalogItemResponseDto {
	return {
		id: row.id,
		organizationId: row.organizationId,
		name: row.name,
		description: row.description,
		defaultPriceEur: row.defaultPriceEur,
		defaultVatRate: row.defaultVatRate,
		sku: row.sku,
		unit: row.unit,
		active: row.active,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString()
	};
}

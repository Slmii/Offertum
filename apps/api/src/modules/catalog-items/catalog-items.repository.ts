import type { Prisma } from '@/generated/prisma/client';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import type { CatalogItemUnit } from '@quoteom/shared';

/** Row shape returned by the repository. `defaultPriceEur` is a string here +
 * on the wire to preserve full decimal precision through JSON. */
export interface CatalogItemRow {
	id: string;
	organizationId: string;
	name: string;
	description: string | null;
	defaultPriceEur: string;
	defaultVatRate: number;
	sku: string | null;
	unit: CatalogItemUnit;
	active: boolean;
	createdAt: Date;
	updatedAt: Date;
}

interface CreateCatalogItemRepoInput {
	organizationId: string;
	name: string;
	description: string | null;
	defaultPriceEur: string;
	defaultVatRate: number;
	sku: string | null;
	unit: CatalogItemUnit;
	active: boolean;
}

interface UpdateCatalogItemRepoInput {
	name?: string;
	description?: string | null;
	defaultPriceEur?: string;
	defaultVatRate?: number;
	sku?: string | null;
	unit?: CatalogItemUnit;
	active?: boolean;
}

@Injectable()
export class CatalogItemsRepository {
	constructor(private readonly prisma: PrismaService) {}

	async listForOrganization(organizationId: string): Promise<CatalogItemRow[]> {
		const rows = await this.prisma.catalogItem.findMany({
			where: { organizationId },
			orderBy: [{ active: 'desc' }, { createdAt: 'desc' }]
		});
		return rows.map(toCatalogItemRow);
	}

	async findByIdForOrganization(organizationId: string, id: string): Promise<CatalogItemRow | null> {
		const row = await this.prisma.catalogItem.findFirst({
			where: { id, organizationId }
		});
		return row ? toCatalogItemRow(row) : null;
	}

	async create(input: CreateCatalogItemRepoInput): Promise<CatalogItemRow> {
		// `Decimal` field accepts string at the Prisma boundary so we don't lose
		// precision on €99 999 999.99-sized values.
		const row = await this.prisma.catalogItem.create({
			data: {
				organizationId: input.organizationId,
				name: input.name,
				description: input.description,
				defaultPriceEur: input.defaultPriceEur as unknown as Prisma.Decimal,
				defaultVatRate: input.defaultVatRate,
				sku: input.sku,
				unit: input.unit,
				active: input.active
			}
		});
		return toCatalogItemRow(row);
	}

	async update(id: string, patch: UpdateCatalogItemRepoInput): Promise<CatalogItemRow> {
		const data: Prisma.CatalogItemUpdateInput = {
			...(patch.name !== undefined ? { name: patch.name } : {}),
			...(patch.description !== undefined ? { description: patch.description } : {}),
			...(patch.defaultPriceEur !== undefined
				? { defaultPriceEur: patch.defaultPriceEur as unknown as Prisma.Decimal }
				: {}),
			...(patch.defaultVatRate !== undefined ? { defaultVatRate: patch.defaultVatRate } : {}),
			...(patch.sku !== undefined ? { sku: patch.sku } : {}),
			...(patch.unit !== undefined ? { unit: patch.unit } : {}),
			...(patch.active !== undefined ? { active: patch.active } : {})
		};
		const row = await this.prisma.catalogItem.update({ where: { id }, data });
		return toCatalogItemRow(row);
	}

	async delete(id: string): Promise<void> {
		await this.prisma.catalogItem.delete({ where: { id } });
	}
}

function toCatalogItemRow(row: {
	id: string;
	organizationId: string;
	name: string;
	description: string | null;
	defaultPriceEur: Prisma.Decimal;
	defaultVatRate: number;
	sku: string | null;
	unit: string;
	active: boolean;
	createdAt: Date;
	updatedAt: Date;
}): CatalogItemRow {
	return {
		id: row.id,
		organizationId: row.organizationId,
		name: row.name,
		description: row.description,
		defaultPriceEur: row.defaultPriceEur.toString(),
		defaultVatRate: row.defaultVatRate,
		sku: row.sku,
		// API DTO validation guarantees only `CatalogItemUnit` values are written; the
		// DB column is TEXT for forward-compat. Cast at the read boundary.
		unit: row.unit as CatalogItemUnit,
		active: row.active,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt
	};
}

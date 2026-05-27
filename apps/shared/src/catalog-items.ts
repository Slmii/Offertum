/**
 * Owner-maintained catalog of products / services. The AI line-item proposer
 * (W10.1) matches incoming opportunity context against this catalog when
 * drafting quotes; the deterministic engine fires here first, the LLM fallback
 * only handles the residual.
 *
 * `defaultPriceEur` is serialized as a string on the wire to preserve full
 * decimal precision (Prisma `Decimal` → JSON would lose precision on large
 * values; the FE parses with `parseFloat` for display, sends back as string
 * for save).
 */

/**
 * Closed set of allowed `unit` values. Canonical English IDs in storage so
 * the column stays jurisdiction-agnostic; UI labels are localized via
 * `CATALOG_ITEM_UNIT_LABELS_NL` (and equivalents per locale when i18n lands).
 * Order here drives the order in the settings dropdown — services first, then
 * count-based, then dimensional.
 */
export const CATALOG_ITEM_UNITS = [
	'hour',
	'day',
	'piece',
	'set',
	'package',
	'flat_fee',
	'meter',
	'square_meter',
	'cubic_meter',
	'kilogram',
	'liter'
] as const;

export type CatalogItemUnit = (typeof CATALOG_ITEM_UNITS)[number];

/** Dutch labels for `CatalogItemUnit`. Keep this map in sync with the union. */
export const CATALOG_ITEM_UNIT_LABELS_NL: Record<CatalogItemUnit, string> = {
	hour: 'uur',
	day: 'dag',
	piece: 'stuk',
	set: 'set',
	package: 'pakket',
	flat_fee: 'forfait',
	meter: 'm',
	square_meter: 'm²',
	cubic_meter: 'm³',
	kilogram: 'kg',
	liter: 'liter'
};

export const CATALOG_ITEM_UNIT_DEFAULT: CatalogItemUnit = 'piece';

export interface CatalogItem {
	id: string;
	organizationId: string;
	name: string;
	description: string | null;
	defaultPriceEur: string;
	defaultVatRate: number;
	sku: string | null;
	unit: CatalogItemUnit;
	active: boolean;
	createdAt: string;
	updatedAt: string;
}

export interface CatalogItemList {
	items: CatalogItem[];
}

export interface CreateCatalogItemInput {
	name: string;
	description?: string | null;
	defaultPriceEur: string;
	defaultVatRate: number;
	sku?: string | null;
	unit?: CatalogItemUnit;
	active?: boolean;
}

export interface UpdateCatalogItemInput {
	name?: string;
	description?: string | null;
	defaultPriceEur?: string;
	defaultVatRate?: number;
	sku?: string | null;
	unit?: CatalogItemUnit;
	active?: boolean;
}

/** Catalog-item name max length. Generous — covers most product descriptions. */
export const CATALOG_ITEM_NAME_MAX_LENGTH = 200;
/** Free-text description max length. */
export const CATALOG_ITEM_DESCRIPTION_MAX_LENGTH = 2_000;
/** Owner-set SKU max length. */
export const CATALOG_ITEM_SKU_MAX_LENGTH = 64;

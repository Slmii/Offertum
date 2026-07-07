import {
	CATALOG_ITEM_DESCRIPTION_MAX_LENGTH,
	CATALOG_ITEM_NAME_MAX_LENGTH,
	CATALOG_ITEM_PRICE_PATTERN,
	CATALOG_ITEM_SKU_MAX_LENGTH,
	CATALOG_ITEM_UNITS
} from '@offertum/shared';
import z from 'zod';

// Decimal price is captured as a string at the form layer — number inputs flatten
// `9.95` → `9.9499999` on some locales, and the API accepts decimal strings
// directly. Uses the same `CATALOG_ITEM_PRICE_PATTERN` as the API DTO (up to 8 digits
// before the decimal, matching the `Decimal(10, 2)` column) so the FE catches malformed
// input before the network round-trip instead of drifting from the server's cap.
export const CatalogItemSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, 'Vul een naam in')
		.max(CATALOG_ITEM_NAME_MAX_LENGTH, `Maximaal ${CATALOG_ITEM_NAME_MAX_LENGTH} tekens`),
	description: z
		.string()
		.trim()
		.max(CATALOG_ITEM_DESCRIPTION_MAX_LENGTH, `Maximaal ${CATALOG_ITEM_DESCRIPTION_MAX_LENGTH} tekens`),
	defaultPriceEur: z
		.string()
		.trim()
		.regex(CATALOG_ITEM_PRICE_PATTERN, 'Gebruik een prijs met maximaal 8 cijfers voor en 2 na de komma'),
	defaultVatRate: z.string().min(1, 'Kies een BTW-tarief'),
	sku: z.string().trim().max(CATALOG_ITEM_SKU_MAX_LENGTH, `Maximaal ${CATALOG_ITEM_SKU_MAX_LENGTH} tekens`),
	unit: z.enum(CATALOG_ITEM_UNITS, { message: 'Kies een geldige eenheid' }),
	active: z.boolean()
});

export type CatalogItemForm = z.infer<typeof CatalogItemSchema>;

export const CatalogItemsSchema = z.object({ items: z.array(CatalogItemSchema) });
export type CatalogItemsForm = z.infer<typeof CatalogItemsSchema>;

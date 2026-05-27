import {
	CATALOG_ITEM_DESCRIPTION_MAX_LENGTH,
	CATALOG_ITEM_NAME_MAX_LENGTH,
	CATALOG_ITEM_SKU_MAX_LENGTH,
	CATALOG_ITEM_UNITS
} from '@quoteom/shared';
import z from 'zod';

// Decimal price is captured as a string at the form layer — number inputs flatten
// `9.95` → `9.9499999` on some locales, and the API accepts decimal strings
// directly. Regex matches `^\d+(\.\d{1,2})?$` so the FE catches malformed input
// before the network round-trip.
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
		.regex(/^\d+(\.\d{1,2})?$/, 'Gebruik een prijs met maximaal 2 decimalen, bijv. 9.95'),
	defaultVatRate: z.coerce
		.number({ message: 'Vul een BTW-percentage in' })
		.int('Geen decimalen')
		.min(0, 'Minimaal 0%')
		.max(30, 'Maximaal 30%'),
	sku: z.string().trim().max(CATALOG_ITEM_SKU_MAX_LENGTH, `Maximaal ${CATALOG_ITEM_SKU_MAX_LENGTH} tekens`),
	unit: z.enum(CATALOG_ITEM_UNITS, { message: 'Kies een geldige eenheid' }),
	active: z.boolean()
});

export type CatalogItemForm = z.infer<typeof CatalogItemSchema>;

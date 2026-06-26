import { Banner } from '@/components/Banner.component';
import { Dialog } from '@/components/Dialog.component';
import { Field } from '@/components/Form/Field/Field.component';
import { Form } from '@/components/Form/Form.component';
import { Select } from '@/components/Form/Select/Select.component';
import { Switch as FormSwitch } from '@/components/Form/Switch/Switch.component';
import { useCreateCatalogItem, useUpdateCatalogItem } from '@/lib/queries/catalog-items.queries';
import { vatSettingsQueryOptions } from '@/lib/queries/vat-settings.queries';
import { CatalogItemSchema, type CatalogItemForm } from '@/lib/schemas/catalog-item.schema';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import {
	buildCatalogVatOptions,
	CATALOG_ITEM_UNIT_DEFAULT,
	CATALOG_ITEM_UNIT_LABELS_NL,
	CATALOG_ITEM_UNITS,
	type CatalogItem,
	type CatalogItemUnit
} from '@offertum/shared';
import { useSuspenseQuery } from '@tanstack/react-query';

const UNIT_OPTIONS = CATALOG_ITEM_UNITS.map(unit => ({ id: unit, label: CATALOG_ITEM_UNIT_LABELS_NL[unit] }));

// Reverse NL-label → unit-key lookup so a denormalized quote-line unit ("stuk", "uur") maps back
// to a catalog `CatalogItemUnit` when pre-filling the create form.
const UNIT_BY_LABEL = new Map(
	(Object.entries(CATALOG_ITEM_UNIT_LABELS_NL) as [CatalogItemUnit, string][]).map(([key, label]) => [
		label.toLowerCase(),
		key
	])
);

/** Map a free-text unit (catalog key OR Dutch label) to a `CatalogItemUnit`, defaulting safely. */
export function toCatalogUnit(unit: string | undefined): CatalogItemUnit {
	if (!unit) {
		return CATALOG_ITEM_UNIT_DEFAULT;
	}
	const lower = unit.toLowerCase();
	if ((CATALOG_ITEM_UNITS as readonly string[]).includes(lower)) {
		return lower as CatalogItemUnit;
	}
	return UNIT_BY_LABEL.get(lower) ?? CATALOG_ITEM_UNIT_DEFAULT;
}

interface CatalogItemDialogProps {
	isOpen: boolean;
	mode: 'create' | 'edit';
	item?: CatalogItem;
	// Create-mode only: seed values (e.g. from a quote line) over the blank defaults.
	prefill?: Partial<CatalogItemForm>;
	onClose: () => void;
}

/**
 * Create / edit dialog for a catalog item. Shared between the Catalogus settings page and the
 * quote view's "Toevoegen" affordance (which opens it in `create` mode, pre-filled from a
 * not-in-catalog line). On success the create/update mutation invalidates the catalog list.
 */
export function CatalogItemDialog({ isOpen, mode, item, prefill, onClose }: CatalogItemDialogProps) {
	const create = useCreateCatalogItem();
	const update = useUpdateCatalogItem();
	const { data: vatConfig } = useSuspenseQuery(vatSettingsQueryOptions);
	const vatOptions = buildCatalogVatOptions(vatConfig);
	const isPending = mode === 'create' ? create.isPending : update.isPending;
	const error = mode === 'create' ? create.error : update.error;

	const handleSubmit = (values: CatalogItemForm) => {
		const payload = {
			name: values.name,
			description: values.description.trim().length === 0 ? null : values.description.trim(),
			defaultPriceEur: values.defaultPriceEur,
			// The form holds the VAT select id as a string; the API expects a number.
			defaultVatRate: Number(values.defaultVatRate),
			sku: values.sku.trim().length === 0 ? null : values.sku.trim(),
			unit: values.unit,
			active: values.active
		};

		if (mode === 'create') {
			create.mutate(payload, { onSuccess: onClose });
		} else if (item) {
			update.mutate({ id: item.id, patch: payload }, { onSuccess: onClose });
		}
	};

	const defaultValues: CatalogItemForm =
		mode === 'edit' && item
			? {
					name: item.name,
					description: item.description ?? '',
					defaultPriceEur: item.defaultPriceEur,
					defaultVatRate: String(item.defaultVatRate),
					sku: item.sku ?? '',
					unit: item.unit,
					active: item.active
				}
			: {
					name: '',
					description: '',
					defaultPriceEur: '0.00',
					defaultVatRate: String(vatConfig.defaultRate),
					sku: '',
					unit: CATALOG_ITEM_UNIT_DEFAULT,
					active: true,
					...prefill
				};

	return (
		<Dialog
			open={isOpen}
			title={mode === 'create' ? 'Nieuw catalogusitem' : 'Catalogusitem bewerken'}
			onClose={onClose}
			disableClose={isPending}
			width={600}
			action={
				<>
					<Button onClick={onClose} disabled={isPending}>
						Annuleren
					</Button>
					<Button type='submit' form='catalog-item-form' variant='contained' disabled={isPending}>
						{isPending ? 'Opslaan…' : 'Opslaan'}
					</Button>
				</>
			}
		>
			<Form<CatalogItemForm>
				id='catalog-item-form'
				action={handleSubmit}
				schema={CatalogItemSchema}
				defaultValues={defaultValues}
			>
				<Stack useFlexGap spacing={3} sx={{ pt: 1 }}>
					<Field name='name' label='Naam' fullWidth autoFocus />
					<Field name='description' label='Omschrijving (optioneel)' fullWidth multiline />
					<Stack direction='row' useFlexGap spacing={2}>
						<Field name='defaultPriceEur' label='Prijs (€)' fullWidth />
						<Select name='unit' label='Eenheid' options={UNIT_OPTIONS} fullWidth />
						<Select name='defaultVatRate' label='BTW' options={vatOptions} fullWidth />
					</Stack>
					<Field name='sku' label='SKU (optioneel)' fullWidth />
					<FormSwitch name='active' label='Actief' />
					{error && (
						<Banner tone='error'>{error instanceof Error ? error.message : 'Opslaan mislukt.'}</Banner>
					)}
				</Stack>
			</Form>
		</Dialog>
	);
}

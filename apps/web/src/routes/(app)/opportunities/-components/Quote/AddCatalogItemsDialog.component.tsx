import { AppIcon } from '@/components/AppIcon.component';
import { toCatalogUnit } from '@/components/CatalogItemDialog.component';
import { Dialog } from '@/components/Dialog.component';
import { Field } from '@/components/Form/Field/Field.component';
import { Form } from '@/components/Form/Form.component';
import { Select } from '@/components/Form/Select/Select.component';
import { Switch as FormSwitch } from '@/components/Form/Switch/Switch.component';
import { BodySmall } from '@/components/Text.component';
import { useToast } from '@/lib/hooks/use-toast';
import { useCreateCatalogItem } from '@/lib/queries/catalog-items.queries';
import { CatalogItemsSchema, type CatalogItemForm, type CatalogItemsForm } from '@/lib/schemas/catalog-item.schema';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import { CATALOG_ITEM_UNIT_LABELS_NL, CATALOG_ITEM_UNITS, pluralize, type QuoteLineItem } from '@offertum/shared';
import { useState } from 'react';

const UNIT_OPTIONS = CATALOG_ITEM_UNITS.map(unit => ({ id: unit, label: CATALOG_ITEM_UNIT_LABELS_NL[unit] }));
const FORM_ID = 'add-catalog-items-form';

/** Seed one catalog-item form from a not-in-catalog quote line. */
function lineToForm(line: QuoteLineItem): CatalogItemForm {
	return {
		name: line.description,
		description: '',
		defaultPriceEur: line.unitPriceEur ?? '0.00',
		// Reverse-charged lines carry no rate; fall back to 21 so the catalog item has a sane default.
		defaultVatRate: line.vatReverseCharged ? 21 : line.vatRate,
		sku: '',
		unit: toCatalogUnit(line.unit),
		active: true
	};
}

/**
 * Add one or more not-in-catalog quote lines to the catalog in a single modal. With multiple
 * lines each is a collapsible form (first expanded); a single line renders its form directly.
 * "Toevoegen" creates them all at once; on success the catalog-items cache is invalidated so the
 * quote's "niet in je catalogus" count (recomputed against the live catalog) drops.
 */
export function AddCatalogItemsDialog({
	isOpen,
	lines,
	onClose
}: {
	isOpen: boolean;
	lines: QuoteLineItem[];
	onClose: () => void;
}) {
	const toast = useToast();
	const create = useCreateCatalogItem();
	const [submitting, setSubmitting] = useState(false);

	const single = lines.length === 1;
	const defaultValues: CatalogItemsForm = { items: lines.map(lineToForm) };
	// Re-seed the form whenever the target lines change (they shrink after a successful add).
	const formKey = lines.map(line => line.id).join('|');

	const onSubmit = async (values: CatalogItemsForm) => {
		setSubmitting(true);
		try {
			await Promise.all(
				values.items.map(item =>
					create.mutateAsync({
						name: item.name,
						description: item.description.trim().length === 0 ? null : item.description.trim(),
						defaultPriceEur: item.defaultPriceEur,
						defaultVatRate: item.defaultVatRate,
						sku: item.sku.trim().length === 0 ? null : item.sku.trim(),
						unit: item.unit,
						active: item.active
					})
				)
			);
			onClose();
		} catch (error) {
			toast.error('Toevoegen mislukt', error instanceof Error ? error.message : 'Probeer het opnieuw.');
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<Dialog
			open={isOpen}
			title={single ? 'Toevoegen aan catalogus' : `${lines.length} regels toevoegen aan catalogus`}
			onClose={onClose}
			disableClose={submitting}
			width={600}
			action={
				<>
					<Button onClick={onClose} disabled={submitting}>
						Annuleren
					</Button>
					<Button
						type='submit'
						form={FORM_ID}
						variant='contained'
						disabled={submitting || lines.length === 0}
					>
						{submitting
							? 'Opslaan…'
							: single
								? 'Toevoegen'
								: `Alle ${lines.length} ${pluralize(lines.length, 'regel', 'regels')} toevoegen`}
					</Button>
				</>
			}
		>
			<Form<CatalogItemsForm>
				key={formKey}
				id={FORM_ID}
				action={onSubmit}
				schema={CatalogItemsSchema}
				defaultValues={defaultValues}
			>
				{single ? (
					<CatalogItemFields index={0} skipPadding />
				) : (
					<Stack useFlexGap spacing={1}>
						{lines.map((line, index) => (
							<Accordion key={line.id} disableGutters>
								<AccordionSummary expandIcon={<AppIcon name='chevron-down' size='small' />}>
									<BodySmall fontWeight='bold'>{line.description || `Regel ${index + 1}`}</BodySmall>
								</AccordionSummary>
								<AccordionDetails>
									<CatalogItemFields index={index} />
								</AccordionDetails>
							</Accordion>
						))}
					</Stack>
				)}
			</Form>
		</Dialog>
	);
}

/** The catalog-item fields for one array entry (`items.<index>.*`). */
function CatalogItemFields({ index, skipPadding }: { index: number; skipPadding?: boolean }) {
	const prefix = `items.${index}` as const;
	return (
		<Stack useFlexGap spacing={3} sx={{ p: skipPadding ? 0 : 2 }}>
			<Field name={`${prefix}.name`} label='Naam' fullWidth />
			<Field name={`${prefix}.description`} label='Omschrijving (optioneel)' fullWidth multiline />
			<Stack direction='row' useFlexGap spacing={2}>
				<Field name={`${prefix}.defaultPriceEur`} label='Prijs (€)' fullWidth />
				<Select name={`${prefix}.unit`} label='Eenheid' options={UNIT_OPTIONS} fullWidth />
				<Field name={`${prefix}.defaultVatRate`} label='BTW (%)' type='number' fullWidth />
			</Stack>
			<Field name={`${prefix}.sku`} label='SKU (optioneel)' fullWidth />
			<FormSwitch name={`${prefix}.active`} label='Actief' />
		</Stack>
	);
}

import { Field } from '@/components/Form/Field/Field.component';
import { Form } from '@/components/Form/Form.component';
import { Select } from '@/components/Form/Select/Select.component';
import { Switch as FormSwitch } from '@/components/Form/Switch/Switch.component';
import { SectionError } from '@/components/SectionError.component';
import {
	catalogItemsQueryOptions,
	useCreateCatalogItem,
	useDeleteCatalogItem,
	useUpdateCatalogItem
} from '@/lib/queries/catalog-items.queries';
import { myMembershipQueryOptions } from '@/lib/queries/team.queries';
import { CatalogItemSchema, type CatalogItemForm } from '@/lib/schemas/catalog-item.schema';
import { toReadableEuro } from '@/lib/utils/number.utils';
import { CATALOG_ITEM_UNIT_DEFAULT, CATALOG_ITEM_UNIT_LABELS_NL, CATALOG_ITEM_UNITS } from '@quoteom/shared';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { CatalogItem } from '@quoteom/shared';

const UNIT_OPTIONS = CATALOG_ITEM_UNITS.map(unit => ({ id: unit, label: CATALOG_ITEM_UNIT_LABELS_NL[unit] }));
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useState } from 'react';

export const Route = createFileRoute('/(app)/settings/catalog')({
	beforeLoad: async ({ context }) => {
		const me = await context.queryClient.ensureQueryData(myMembershipQueryOptions);
		if (me.role !== 'OWNER') {
			throw redirect({ to: '/' });
		}
	},
	loader: ({ context }) => context.queryClient.ensureQueryData(catalogItemsQueryOptions),
	component: CatalogSettingsPage,
	errorComponent: SectionError
});

function CatalogSettingsPage() {
	const { data } = useSuspenseQuery(catalogItemsQueryOptions);
	const [editing, setEditing] = useState<CatalogItem | null>(null);
	const [creating, setCreating] = useState(false);
	const [deleteTarget, setDeleteTarget] = useState<CatalogItem | null>(null);

	return (
		<Container maxWidth='md' sx={{ py: 6 }}>
			<Box
				sx={{
					mb: 6,
					display: 'flex',
					justifyContent: 'space-between',
					alignItems: 'flex-start'
				}}
			>
				<Box>
					<Typography variant='h4' component='h1' sx={{ mb: 2 }}>
						Catalogus
					</Typography>
					<Typography variant='body2' sx={{ color: 'text.secondary', maxWidth: 560 }}>
						Producten en diensten met standaardprijzen die Quoteom voorstelt bij het opstellen van offertes.
						De AI matcht binnenkomende vragen tegen deze lijst — exacte matches gaan deterministisch, de
						rest valt terug op een LLM-voorstel.
					</Typography>
				</Box>
				<Button variant='contained' onClick={() => setCreating(true)} sx={{ flexShrink: 0 }}>
					Nieuw item
				</Button>
			</Box>

			{data.items.length === 0 ? (
				<Paper variant='outlined' sx={{ p: 6, borderRadius: 2, textAlign: 'center' }}>
					<Typography variant='body2' sx={{ color: 'text.secondary', mb: 3 }}>
						Nog geen items in je catalogus.
					</Typography>
					<Button variant='outlined' onClick={() => setCreating(true)}>
						Eerste item toevoegen
					</Button>
				</Paper>
			) : (
				<Stack spacing={2}>
					{data.items.map(item => (
						<CatalogItemRow
							key={item.id}
							item={item}
							onEdit={() => setEditing(item)}
							onDelete={() => setDeleteTarget(item)}
						/>
					))}
				</Stack>
			)}

			{creating && <CatalogItemDialog mode='create' onClose={() => setCreating(false)} />}
			{editing && <CatalogItemDialog mode='edit' item={editing} onClose={() => setEditing(null)} />}
			{deleteTarget && <DeleteConfirmDialog item={deleteTarget} onClose={() => setDeleteTarget(null)} />}
		</Container>
	);
}

interface CatalogItemRowProps {
	item: CatalogItem;
	onEdit: () => void;
	onDelete: () => void;
}

function CatalogItemRow({ item, onEdit, onDelete }: CatalogItemRowProps) {
	return (
		<Paper variant='outlined' sx={{ p: 4, borderRadius: 2, opacity: item.active ? 1 : 0.6 }}>
			<Stack direction='row' spacing={3} sx={{ alignItems: 'center' }}>
				<Box sx={{ flexGrow: 1, minWidth: 0 }}>
					<Stack direction='row' spacing={2} sx={{ alignItems: 'center', mb: 1 }}>
						<Typography variant='subtitle2'>{item.name}</Typography>
						{!item.active && <Chip label='Inactief' size='small' />}
						{item.sku && <Chip label={`SKU: ${item.sku}`} size='small' variant='outlined' />}
					</Stack>
					{item.description && (
						<Typography variant='body2' sx={{ color: 'text.secondary', mb: 1 }}>
							{item.description}
						</Typography>
					)}
					<Typography variant='caption' sx={{ color: 'text.secondary' }}>
						{toReadableEuro(Number(item.defaultPriceEur))} / {CATALOG_ITEM_UNIT_LABELS_NL[item.unit]} · BTW{' '}
						{item.defaultVatRate}%
					</Typography>
				</Box>
				<Stack direction='row' spacing={1} sx={{ flexShrink: 0 }}>
					<Button size='small' variant='outlined' onClick={onEdit}>
						Bewerken
					</Button>
					<Button size='small' variant='outlined' color='error' onClick={onDelete}>
						Verwijderen
					</Button>
				</Stack>
			</Stack>
		</Paper>
	);
}

interface CatalogItemDialogProps {
	mode: 'create' | 'edit';
	item?: CatalogItem;
	onClose: () => void;
}

function CatalogItemDialog({ mode, item, onClose }: CatalogItemDialogProps) {
	const create = useCreateCatalogItem();
	const update = useUpdateCatalogItem();
	const isPending = mode === 'create' ? create.isPending : update.isPending;
	const error = mode === 'create' ? create.error : update.error;

	const handleSubmit = (values: CatalogItemForm) => {
		const payload = {
			name: values.name,
			description: values.description.trim().length === 0 ? null : values.description.trim(),
			defaultPriceEur: values.defaultPriceEur,
			defaultVatRate: values.defaultVatRate,
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
					defaultVatRate: item.defaultVatRate,
					sku: item.sku ?? '',
					unit: item.unit,
					active: item.active
				}
			: {
					name: '',
					description: '',
					defaultPriceEur: '0.00',
					defaultVatRate: 21,
					sku: '',
					unit: CATALOG_ITEM_UNIT_DEFAULT,
					active: true
				};

	return (
		<Dialog open onClose={onClose} maxWidth='sm' fullWidth>
			<Form<CatalogItemForm> action={handleSubmit} schema={CatalogItemSchema} defaultValues={defaultValues}>
				<DialogTitle>{mode === 'create' ? 'Nieuw catalogusitem' : 'Catalogusitem bewerken'}</DialogTitle>
				<DialogContent dividers>
					<Stack spacing={3} sx={{ pt: 1 }}>
						<Field name='name' label='Naam' fullWidth autoFocus />
						<Field name='description' label='Omschrijving (optioneel)' fullWidth multiline />
						<Stack direction='row' spacing={2}>
							<Field name='defaultPriceEur' label='Prijs (€)' fullWidth />
							<Select name='unit' label='Eenheid' options={UNIT_OPTIONS} fullWidth />
							<Field name='defaultVatRate' label='BTW (%)' type='number' fullWidth />
						</Stack>
						<Field name='sku' label='SKU (optioneel)' fullWidth />
						<FormSwitch name='active' label='Actief' />
						{error && (
							<Alert severity='error'>
								{error instanceof Error ? error.message : 'Opslaan mislukt.'}
							</Alert>
						)}
					</Stack>
				</DialogContent>
				<DialogActions>
					<Button onClick={onClose} disabled={isPending}>
						Annuleren
					</Button>
					<Button type='submit' variant='contained' disabled={isPending}>
						{isPending ? 'Opslaan…' : 'Opslaan'}
					</Button>
				</DialogActions>
			</Form>
		</Dialog>
	);
}

interface DeleteConfirmDialogProps {
	item: CatalogItem;
	onClose: () => void;
}

function DeleteConfirmDialog({ item, onClose }: DeleteConfirmDialogProps) {
	const remove = useDeleteCatalogItem();

	const confirm = () => {
		remove.mutate(item.id, { onSuccess: onClose });
	};

	return (
		<Dialog open onClose={onClose} maxWidth='xs' fullWidth>
			<DialogTitle>Catalogusitem verwijderen?</DialogTitle>
			<DialogContent>
				<DialogContentText>
					Weet je zeker dat je <strong>{item.name}</strong> wilt verwijderen? Eerder opgestelde offertes
					behouden hun regels — alleen toekomstige voorstellen worden geraakt.
				</DialogContentText>
				{remove.error && (
					<Alert severity='error' sx={{ mt: 2 }}>
						{remove.error instanceof Error ? remove.error.message : 'Verwijderen mislukt.'}
					</Alert>
				)}
			</DialogContent>
			<DialogActions>
				<Button onClick={onClose} disabled={remove.isPending}>
					Annuleren
				</Button>
				<Button onClick={confirm} variant='contained' color='error' disabled={remove.isPending}>
					{remove.isPending ? 'Verwijderen…' : 'Verwijderen'}
				</Button>
			</DialogActions>
		</Dialog>
	);
}

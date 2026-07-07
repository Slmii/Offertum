import { CatalogItemDialog } from '@/components/CatalogItemDialog.component';
import { Dialog } from '@/components/Dialog.component';
import { PageHeader } from '@/components/PageHeader.component';
import { SectionError } from '@/components/SectionError.component';
import { BodySmall, Label } from '@/components/Text.component';
import { useToast } from '@/lib/hooks/use-toast';
import { catalogItemsQueryOptions, useDeleteCatalogItem } from '@/lib/queries/catalog-items.queries';
import { myMembershipQueryOptions } from '@/lib/queries/team.queries';
import { vatSettingsQueryOptions } from '@/lib/queries/vat-settings.queries';
import { toReadableEuro } from '@/lib/utils/number.utils';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import DialogContentText from '@mui/material/DialogContentText';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import { CATALOG_ITEM_UNIT_LABELS_NL, type CatalogItem } from '@offertum/shared';
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
	loader: ({ context }) =>
		Promise.all([
			context.queryClient.ensureQueryData(catalogItemsQueryOptions),
			// The create/edit dialog reads the org VAT config for its BTW dropdown.
			context.queryClient.ensureQueryData(vatSettingsQueryOptions)
		]),
	component: CatalogSettingsPage,
	errorComponent: SectionError
});

function CatalogSettingsPage() {
	const { data } = useSuspenseQuery(catalogItemsQueryOptions);
	const [editing, setEditing] = useState<CatalogItem | null>(null);
	const [creating, setCreating] = useState(false);
	const [deleteTarget, setDeleteTarget] = useState<CatalogItem | null>(null);

	return (
		<Stack>
			<PageHeader
				title='Catalogus'
				caption='Producten en diensten met standaardprijzen die Offertum voorstelt bij het opstellen van offertes. Offertum matcht binnenkomende vragen tegen deze lijst, exacte matches gaan deterministisch, de rest valt terug op een voorstel van Offertum.'
				actions={
					<Button variant='contained' onClick={() => setCreating(true)} sx={{ flexShrink: 0 }}>
						Nieuw item
					</Button>
				}
			/>

			{data.items.length === 0 ? (
				<Paper variant='outlined' sx={{ p: 6, borderRadius: 2, textAlign: 'center' }}>
					<BodySmall color='textSecondary' sx={{ display: 'block', mb: 3 }}>
						Nog geen items in je catalogus.
					</BodySmall>
					<Button variant='outlined' onClick={() => setCreating(true)}>
						Eerste item toevoegen
					</Button>
				</Paper>
			) : (
				<Stack useFlexGap spacing={2}>
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

			<CatalogItemDialog isOpen={creating} mode='create' onClose={() => setCreating(false)} />
			<CatalogItemDialog
				isOpen={!!editing}
				mode='edit'
				item={editing ?? undefined}
				onClose={() => setEditing(null)}
			/>
			<DeleteConfirmDialog
				isOpen={!!deleteTarget}
				item={deleteTarget ?? undefined}
				onClose={() => setDeleteTarget(null)}
			/>
		</Stack>
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
			<Stack direction='row' useFlexGap spacing={3} sx={{ alignItems: 'center' }}>
				<Box sx={{ flexGrow: 1, minWidth: 0 }}>
					<Stack direction='row' useFlexGap spacing={2} sx={{ alignItems: 'center', mb: 1 }}>
						<Label>{item.name}</Label>
						{!item.active && <Chip label='Inactief' size='small' />}
						{item.sku && <Chip label={`SKU: ${item.sku}`} size='small' variant='outlined' />}
					</Stack>
					{item.description && (
						<BodySmall color='textSecondary' sx={{ mb: 1 }}>
							{item.description}
						</BodySmall>
					)}
					<BodySmall color='textSecondary'>
						{toReadableEuro(Number(item.defaultPriceEur))} / {CATALOG_ITEM_UNIT_LABELS_NL[item.unit]} · BTW{' '}
						{item.defaultVatRate}%
					</BodySmall>
				</Box>
				<Stack direction='row' useFlexGap spacing={1} sx={{ flexShrink: 0 }}>
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

interface DeleteConfirmDialogProps {
	isOpen: boolean;
	item?: CatalogItem;
	onClose: () => void;
}

function DeleteConfirmDialog({ isOpen, item, onClose }: DeleteConfirmDialogProps) {
	const toast = useToast();
	const remove = useDeleteCatalogItem();

	const confirm = () => {
		if (item) {
			remove.mutate(item.id, {
				onSuccess: onClose,
				onError: error =>
					toast.error('Verwijderen mislukt', error instanceof Error ? error.message : 'Probeer het opnieuw.')
			});
		}
	};

	return (
		<Dialog
			open={isOpen}
			title='Catalogusitem verwijderen?'
			onClose={onClose}
			disableClose={remove.isPending}
			width={440}
			action={
				<>
					<Button onClick={onClose} disabled={remove.isPending}>
						Annuleren
					</Button>
					<Button onClick={confirm} variant='contained' color='error' disabled={remove.isPending}>
						{remove.isPending ? 'Verwijderen…' : 'Verwijderen'}
					</Button>
				</>
			}
		>
			<DialogContentText>
				Weet je zeker dat je <strong>{item?.name ?? 'dit item'}</strong> wilt verwijderen? Eerder opgestelde
				offertes behouden hun regels, alleen toekomstige voorstellen worden geraakt.
			</DialogContentText>
		</Dialog>
	);
}

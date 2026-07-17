import { AppIcon } from '@/components/AppIcon.component';
import { CatalogItemDialog } from '@/components/CatalogItemDialog.component';
import { Dialog } from '@/components/Dialog.component';
import { StandaloneField } from '@/components/Form/Field/Field.component';
import { PageHeader } from '@/components/PageHeader.component';
import { SectionError } from '@/components/SectionError.component';
import { Segmented } from '@/components/Segmented.component';
import { BodySmall } from '@/components/Text.component';
import { useToast } from '@/lib/hooks/use-toast';
import {
	catalogItemsQueryOptions,
	useDeleteCatalogItem,
	useUpdateCatalogItem
} from '@/lib/queries/catalog-items.queries';
import { myMembershipQueryOptions } from '@/lib/queries/team.queries';
import { vatSettingsQueryOptions } from '@/lib/queries/vat-settings.queries';
import { toReadableEuro } from '@/lib/utils/number.utils';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import DialogContentText from '@mui/material/DialogContentText';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import { useTheme } from '@mui/material/styles';
import { CATALOG_ITEM_UNIT_LABELS_NL, pluralize, type CatalogItem } from '@offertum/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useMemo, useState } from 'react';

type CatalogFilter = 'all' | 'active' | 'inactive';

const FILTER_OPTIONS: { id: CatalogFilter; label: string }[] = [
	{ id: 'all', label: 'Alle' },
	{ id: 'active', label: 'Actief' },
	{ id: 'inactive', label: 'Inactief' }
];

// The selection bar swaps in above the rows when items are checked; it shares this height with the
// column-header row so switching between the two states never changes the table's height.
const TABLE_HEADER_HEIGHT = 48;

// Catalogus is a top-level page (its own sidebar item — sibling of Instellingen), NOT a settings
// sub-tab, so it renders without the Settings area's inline sub-nav. Owner-only + prefetches the
// item list and the org VAT config (the create/edit dialog's BTW dropdown reads it).
export const Route = createFileRoute('/(app)/catalog')({
	beforeLoad: async ({ context }) => {
		const me = await context.queryClient.ensureQueryData(myMembershipQueryOptions);
		if (me.role !== 'OWNER') {
			throw redirect({ to: '/' });
		}
	},
	loader: ({ context }) =>
		Promise.all([
			context.queryClient.ensureQueryData(catalogItemsQueryOptions),
			context.queryClient.ensureQueryData(vatSettingsQueryOptions)
		]),
	component: CatalogPage,
	errorComponent: SectionError
});

function CatalogPage() {
	const { data } = useSuspenseQuery(catalogItemsQueryOptions);
	const [editing, setEditing] = useState<CatalogItem | null>(null);
	const [creating, setCreating] = useState(false);
	const [deleteTarget, setDeleteTarget] = useState<CatalogItem | null>(null);
	const [query, setQuery] = useState('');
	const [filter, setFilter] = useState<CatalogFilter>('all');

	const items = data.items;
	const activeCount = items.filter(item => item.active).length;

	// Search (name / description / SKU) + status filter, then active-first ordering.
	const visible = useMemo(() => {
		const q = query.trim().toLowerCase();
		return items.filter(item => {
			if (filter === 'active' && !item.active) {
				return false;
			}
			if (filter === 'inactive' && item.active) {
				return false;
			}
			if (!q) {
				return true;
			}
			return (
				item.name.toLowerCase().includes(q) ||
				(item.description ?? '').toLowerCase().includes(q) ||
				(item.sku ?? '').toLowerCase().includes(q)
			);
		});
	}, [items, query, filter]);

	return (
		<Stack>
			<PageHeader
				title='Catalogus'
				caption='Producten en diensten met standaardprijzen die Offertum voorstelt bij het opstellen van offertes.'
				actions={
					<Button
						variant='contained'
						startIcon={<AppIcon name='plus' size='small' />}
						onClick={() => setCreating(true)}
					>
						Nieuw item
					</Button>
				}
			/>

			{items.length === 0 ? (
				<EmptyCatalog onAdd={() => setCreating(true)} />
			) : (
				<Stack useFlexGap spacing={1.75}>
					{/* Toolbar — search + status filter + counts */}
					<Stack direction='row' useFlexGap spacing={2} sx={{ alignItems: 'center' }}>
						<StandaloneField
							name='search'
							value={query}
							fullWidth
							onChange={event => setQuery(event.target.value)}
							placeholder='Zoek op naam, omschrijving of SKU'
							size='small'
							slotProps={{
								input: {
									startAdornment: (
										<InputAdornment position='start'>
											<AppIcon name='search' size='small' />
										</InputAdornment>
									)
								}
							}}
						/>
						<Segmented value={filter} options={FILTER_OPTIONS} onChange={setFilter} ariaLabel='Filter' />
						<BodySmall
							color='textSecondary'
							className='tabular'
							sx={{ ml: 'auto', minWidth: 'fit-content' }}
						>
							{activeCount} actief · {items.length} totaal
						</BodySmall>
					</Stack>

					<CatalogTable visible={visible} onEdit={setEditing} onDelete={setDeleteTarget} />
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

function CatalogTable({
	visible,
	onEdit,
	onDelete
}: {
	visible: CatalogItem[];
	onEdit: (item: CatalogItem) => void;
	onDelete: (item: CatalogItem) => void;
}) {
	const { tokens } = useTheme();
	const remove = useDeleteCatalogItem();
	const toast = useToast();
	const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
	const [bulkOpen, setBulkOpen] = useState(false);
	const [bulkDeleting, setBulkDeleting] = useState(false);

	// Selection is scoped to the currently-visible (searched/filtered) rows.
	const selected = visible.filter(item => selectedIds.has(item.id));
	const selectedCount = selected.length;
	const allSelected = visible.length > 0 && selectedCount === visible.length;
	const someSelected = selectedCount > 0 && !allSelected;

	const toggleAll = (): void => setSelectedIds(allSelected ? new Set() : new Set(visible.map(item => item.id)));
	const toggleOne = (id: string): void =>
		setSelectedIds(prev => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	const clearSelection = (): void => setSelectedIds(new Set());

	const confirmBulkDelete = async (): Promise<void> => {
		setBulkDeleting(true);
		try {
			await Promise.all(selected.map(item => remove.mutateAsync(item.id)));
			clearSelection();
			setBulkOpen(false);
		} catch {
			toast.error('Verwijderen mislukt', 'Kon niet alle geselecteerde items verwijderen.');
		} finally {
			setBulkDeleting(false);
		}
	};

	return (
		// Same MUI Table primitives (+ theme styling) as the quote-items table, so every table in the
		// app reads identically. The frame (border/radius/shadow) clips the toolbar + rows.
		<Box
			sx={{
				border: `1px solid ${tokens.color.line}`,
				borderRadius: `${tokens.radius.md}px`,
				boxShadow: tokens.shadow[1],
				backgroundColor: tokens.color.surface,
				overflow: 'hidden'
			}}
		>
			{selectedCount > 0 && (
				<CatalogSelectionToolbar
					count={selectedCount}
					onClear={clearSelection}
					onDelete={() => setBulkOpen(true)}
					deleting={bulkDeleting}
				/>
			)}
			<TableContainer sx={{ overflowX: 'auto' }}>
				<Table sx={{ minWidth: 760 }}>
					<TableHead>
						<TableRow sx={{ height: TABLE_HEADER_HEIGHT, '& .MuiTableCell-root': { py: 0 } }}>
							<TableCell padding='checkbox'>
								<Checkbox
									size='small'
									checked={allSelected}
									indeterminate={someSelected}
									onChange={toggleAll}
									slotProps={{ input: { 'aria-label': 'Alle items selecteren' } }}
								/>
							</TableCell>
							<TableCell>Item</TableCell>
							<TableCell align='right' sx={{ width: 150 }}>
								Prijs
							</TableCell>
							<TableCell align='center' sx={{ width: 90 }}>
								BTW
							</TableCell>
							<TableCell align='right' sx={{ width: 150 }}>
								Status
							</TableCell>
							<TableCell align='right' sx={{ width: 96 }}>
								Acties
							</TableCell>
						</TableRow>
					</TableHead>
					<TableBody>
						{visible.length === 0 ? (
							<TableRow>
								<TableCell colSpan={6} align='center' sx={{ py: 5, color: tokens.color.ink3 }}>
									Geen items gevonden voor deze filter.
								</TableCell>
							</TableRow>
						) : (
							visible.map(item => (
								<CatalogRow
									key={item.id}
									item={item}
									selected={selectedIds.has(item.id)}
									onToggleSelect={() => toggleOne(item.id)}
									onEdit={() => onEdit(item)}
									onDelete={() => onDelete(item)}
								/>
							))
						)}
					</TableBody>
				</Table>
			</TableContainer>

			<BulkDeleteDialog
				open={bulkOpen}
				count={selectedCount}
				deleting={bulkDeleting}
				onClose={() => {
					if (!bulkDeleting) {
						setBulkOpen(false);
					}
				}}
				onConfirm={confirmBulkDelete}
			/>
		</Box>
	);
}

/** Selection bar shown above the table when rows are checked — mirrors the quote table's toolbar. */
function CatalogSelectionToolbar({
	count,
	onClear,
	onDelete,
	deleting
}: {
	count: number;
	onClear: () => void;
	onDelete: () => void;
	deleting: boolean;
}) {
	return (
		// A plain flex bar (not MUI Toolbar — that carries a responsive 64px min-height) pinned to the
		// exact column-header row height, so selecting/deselecting never changes the table's height.
		<Box
			sx={theme => ({
				display: 'flex',
				alignItems: 'center',
				height: TABLE_HEADER_HEIGHT,
				px: 1.5,
				gap: 1.5,
				borderBottom: `1px solid ${theme.tokens.color.line}`,
				backgroundColor: theme.tokens.color.accent[50]
			})}
		>
			<BodySmall fontWeight='bold' sx={theme => ({ flex: '1 1 100%', color: theme.tokens.color.accent[700] })}>
				{count} {pluralize(count, 'item', 'items')} geselecteerd
			</BodySmall>
			<Button size='small' variant='text' color='inherit' onClick={onClear} sx={{ minWidth: 'fit-content' }}>
				Selectie wissen
			</Button>
			<Tooltip title='Verwijder selectie'>
				<span>
					<IconButton
						size='small'
						color='error'
						aria-label='Verwijder selectie'
						onClick={onDelete}
						disabled={deleting}
					>
						{deleting ? (
							<CircularProgress size={18} color='inherit' />
						) : (
							<AppIcon name='trash' size='small' />
						)}
					</IconButton>
				</span>
			</Tooltip>
		</Box>
	);
}

function CatalogRow({
	item,
	selected,
	onToggleSelect,
	onEdit,
	onDelete
}: {
	item: CatalogItem;
	selected: boolean;
	onToggleSelect: () => void;
	onEdit: () => void;
	onDelete: () => void;
}) {
	const { tokens } = useTheme();
	const update = useUpdateCatalogItem();
	const toast = useToast();
	const inactive = !item.active;
	const dim = inactive ? 0.62 : 1;

	const toggleActive = (): void => {
		update.mutate(
			{ id: item.id, patch: { active: !item.active } },
			{ onError: () => toast.error('Bijwerken mislukt', 'Kon de status van dit item niet wijzigen.') }
		);
	};

	const stop = (event: { stopPropagation: () => void }): void => event.stopPropagation();

	return (
		<TableRow hover selected={selected} onClick={onEdit} sx={{ cursor: 'pointer' }}>
			<TableCell padding='checkbox' onClick={stop}>
				<Checkbox
					size='small'
					checked={selected}
					onChange={onToggleSelect}
					slotProps={{ input: { 'aria-label': `${item.name} selecteren` } }}
				/>
			</TableCell>

			{/* Item — name, SKU, description */}
			<TableCell sx={{ opacity: dim }}>
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
					<Box
						component='span'
						sx={{
							fontSize: 14,
							fontWeight: 'bold',
							color: tokens.color.ink1,
							letterSpacing: '-0.005em',
							whiteSpace: 'nowrap',
							overflow: 'hidden',
							textOverflow: 'ellipsis'
						}}
					>
						{item.name}
					</Box>
					{item.sku && <SkuChip sku={item.sku} />}
				</Box>
				{item.description && (
					<Box
						sx={{
							mt: 0.5,
							fontSize: 12.5,
							color: tokens.color.ink3,
							lineHeight: 1.45,
							whiteSpace: 'nowrap',
							overflow: 'hidden',
							textOverflow: 'ellipsis',
							maxWidth: 520
						}}
					>
						{item.description}
					</Box>
				)}
			</TableCell>

			{/* Prijs — right aligned, tabular */}
			<TableCell align='right' className='tabular' sx={{ opacity: dim, whiteSpace: 'nowrap' }}>
				<Box component='span' sx={{ fontSize: 14, fontWeight: 'bold', color: tokens.color.ink1 }}>
					{toReadableEuro(Number(item.defaultPriceEur))}
				</Box>
				<Box component='span' sx={{ fontSize: 12, color: tokens.color.ink4, ml: 0.25 }}>
					{' / '}
					{CATALOG_ITEM_UNIT_LABELS_NL[item.unit]}
				</Box>
			</TableCell>

			{/* BTW */}
			<TableCell align='center' className='tabular' sx={{ opacity: dim, color: tokens.color.ink3 }}>
				{item.defaultVatRate}%
			</TableCell>

			{/* Status toggle (stops row-click from opening the editor) */}
			<TableCell align='right' onClick={stop} sx={{ cursor: 'default' }}>
				<Box
					component='label'
					sx={{
						display: 'inline-flex',
						alignItems: 'center',
						justifyContent: 'flex-end',
						gap: 1,
						cursor: 'pointer'
					}}
				>
					<BodySmall color='textSecondary' sx={{ minWidth: 44, textAlign: 'right' }}>
						{item.active ? 'Actief' : 'Inactief'}
					</BodySmall>
					<Switch checked={item.active} onChange={toggleActive} sx={{ mr: 0 }} />
				</Box>
			</TableCell>

			{/* Acties — always visible (after Status) */}
			<TableCell align='right' onClick={stop} sx={{ cursor: 'default' }}>
				<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.25 }}>
					<IconButton aria-label='Bewerken' size='small' onClick={onEdit}>
						<AppIcon name='pen-line' size='small' />
					</IconButton>
					<IconButton
						aria-label='Verwijderen'
						size='small'
						onClick={onDelete}
						sx={{ color: tokens.color.lost[700] }}
					>
						<AppIcon name='trash' size='small' />
					</IconButton>
				</Box>
			</TableCell>
		</TableRow>
	);
}

function BulkDeleteDialog({
	open,
	count,
	deleting,
	onClose,
	onConfirm
}: {
	open: boolean;
	count: number;
	deleting: boolean;
	onClose: () => void;
	onConfirm: () => void;
}) {
	return (
		<Dialog
			open={open}
			title={`${count} ${pluralize(count, 'item', 'items')} verwijderen?`}
			onClose={onClose}
			disableClose={deleting}
			width={440}
			action={
				<>
					<Button onClick={onClose} disabled={deleting}>
						Annuleren
					</Button>
					<Button onClick={onConfirm} variant='contained' color='error' disabled={deleting}>
						{deleting ? 'Verwijderen…' : 'Verwijderen'}
					</Button>
				</>
			}
		>
			<DialogContentText>
				Weet je zeker dat je {count} {pluralize(count, 'item', 'items')} wilt verwijderen? Eerder opgestelde
				offertes behouden hun regels, alleen toekomstige voorstellen worden geraakt.
			</DialogContentText>
		</Dialog>
	);
}

function SkuChip({ sku }: { sku: string }) {
	const { tokens } = useTheme();
	return (
		<Box
			component='span'
			sx={{
				display: 'inline-flex',
				alignItems: 'center',
				gap: 0.5,
				py: 0.25,
				px: 1,
				border: `1px solid ${tokens.color.lineStrong}`,
				borderRadius: `${tokens.radius.sm}px`,
				fontFamily: tokens.font.mono,
				fontSize: 11,
				fontWeight: 'medium',
				letterSpacing: '0.01em',
				flexShrink: 0
			}}
		>
			<Box component='span' sx={{ color: tokens.color.ink4 }}>
				SKU
			</Box>
			<Box component='span' sx={{ color: tokens.color.ink2 }}>
				{sku}
			</Box>
		</Box>
	);
}

function EmptyCatalog({ onAdd }: { onAdd: () => void }) {
	const { tokens } = useTheme();
	return (
		<Box
			sx={{
				backgroundColor: tokens.color.surface,
				border: `1px dashed ${tokens.color.lineStrong}`,
				borderRadius: `${tokens.radius.md}px`,
				py: 7,
				px: 4,
				textAlign: 'center',
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				gap: 1.75
			}}
		>
			<Box
				sx={{
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
					width: 56,
					height: 56,
					borderRadius: `${tokens.radius.md}px`,
					backgroundColor: tokens.color.accent[50],
					color: tokens.color.accent[700]
				}}
			>
				<AppIcon name='package' size='large' />
			</Box>
			<Box>
				<Box sx={{ fontSize: 17, fontWeight: 'bold', color: tokens.color.ink1, mb: 0.75 }}>
					Nog geen items in je catalogus.
				</Box>
				<BodySmall color='textSecondary' sx={{ display: 'block', maxWidth: 460, mx: 'auto', lineHeight: 1.55 }}>
					Voeg de producten en diensten toe die je vaak verkoopt — Offertum gebruikt ze om automatisch regels
					in te vullen op offertes.
				</BodySmall>
			</Box>
			<Button
				variant='contained'
				startIcon={<AppIcon name='plus' size='small' />}
				onClick={onAdd}
				sx={{ mt: 0.5 }}
			>
				Eerste item toevoegen
			</Button>
		</Box>
	);
}

function DeleteConfirmDialog({ isOpen, item, onClose }: { isOpen: boolean; item?: CatalogItem; onClose: () => void }) {
	const remove = useDeleteCatalogItem();
	const toast = useToast();

	const confirm = () => {
		if (item) {
			remove.mutate(item.id, {
				onSuccess: onClose,
				onError: error => {
					toast.error('Verwijderen mislukt', error instanceof Error ? error.message : undefined);
				}
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

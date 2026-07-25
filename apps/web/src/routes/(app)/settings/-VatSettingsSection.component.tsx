import { AppIcon } from '@/components/AppIcon.component';
import { Dialog } from '@/components/Dialog.component';
import { StandaloneField } from '@/components/Form/Field/Field.component';
import { StandaloneSelect } from '@/components/Form/Select/Select.component';
import { StandaloneSwitch } from '@/components/Form/Switch/Switch.component';
import { BodySmall, H3 } from '@/components/Text.component';
import { useToast } from '@/lib/hooks/use-toast';
import { useUpdateVatSettings, vatSettingsQueryOptions } from '@/lib/queries/vat-settings.queries';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import {
	DEFAULT_NL_VAT_CONFIG,
	formatVatRateLabel,
	VAT_KIND_META,
	VAT_RATES_MAX_COUNT,
	VAT_REVERSE_CHARGE_LABEL_MAX_LENGTH,
	vatEnsureDefault,
	type VatRateOption
} from '@offertum/shared';
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { VatRateModal, type VatRateEditTarget } from './-VatRateModal.component';

/**
 * "BTW-tarieven" section on the Organisatie page — the org's configurable VAT rates. Each rate is a
 * named, categorised option that can be set as default or (de)activated; a reverse-charge option is
 * offered separately. Edits persist immediately (owner-only): each row action / toggle fires a
 * PATCH, optimistically updating local state and reverting on error. The free-text reverse-charge
 * label persists on blur (not per keystroke) so one edit is one audit-log entry. Members see it
 * read-only. Local state re-seeds when the server config changes (save refetch or a rejected edit).
 */
export function VatSettingsSection({ isOwner }: { isOwner: boolean }) {
	const { data } = useSuspenseQuery(vatSettingsQueryOptions);
	const update = useUpdateVatSettings();
	const toast = useToast();
	const queryClient = useQueryClient();

	const [seed, setSeed] = useState(data);
	const [rates, setRates] = useState<VatRateOption[]>(data.rates);
	const [reverseEnabled, setReverseEnabled] = useState(data.reverseChargeEnabled);
	const [reverseLabel, setReverseLabel] = useState(data.reverseChargeLabel);
	const [editing, setEditing] = useState<VatRateEditTarget>(null);
	const [confirmDelete, setConfirmDelete] = useState<VatRateOption | null>(null);

	// Re-seed local state when the server config changes (e.g. after a save refetch).
	if (data !== seed) {
		setSeed(data);
		setRates(data.rates);
		setReverseEnabled(data.reverseChargeEnabled);
		setReverseLabel(data.reverseChargeLabel);
	}

	const activeRates = rates.filter(rate => rate.active);
	const defaultRateId = (activeRates.find(rate => rate.isDefault) ?? activeRates[0])?.id ?? '';

	/**
	 * Persist a candidate config (owner-only). Invalid intermediate states (no active rate, an empty
	 * reverse-charge label while enabled, too many rates) are kept locally but not sent, so a
	 * half-finished edit isn't lost and the backend never rejects it. Reverts local state on error.
	 */
	const persist = (nextRates: VatRateOption[], nextReverseEnabled: boolean, nextReverseLabel: string) => {
		if (!isOwner) {
			return;
		}
		const label = nextReverseLabel.trim();
		const configValid =
			nextRates.some(rate => rate.active) &&
			nextRates.length <= VAT_RATES_MAX_COUNT &&
			(!nextReverseEnabled || (label.length > 0 && label.length <= VAT_REVERSE_CHARGE_LABEL_MAX_LENGTH));
		if (!configValid) {
			return;
		}
		update.mutate(
			{ rates: nextRates, reverseChargeEnabled: nextReverseEnabled, reverseChargeLabel: label },
			{
				onError: error => {
					toast.error('Opslaan mislukt', error instanceof Error ? error.message : 'Probeer het opnieuw.');
					// Revert to the freshest server-known config — not the closed-over `data`, which a
					// concurrent successful save may have already superseded in the cache.
					const latest = queryClient.getQueryData(vatSettingsQueryOptions.queryKey) ?? data;
					setRates(latest.rates);
					setReverseEnabled(latest.reverseChargeEnabled);
					setReverseLabel(latest.reverseChargeLabel);
				}
			}
		);
	};

	const applyRates = (nextRates: VatRateOption[]) => {
		const normalized = vatEnsureDefault(nextRates);
		setRates(normalized);
		persist(normalized, reverseEnabled, reverseLabel);
	};

	const handleSaveRate = (rate: VatRateOption) => {
		let next: VatRateOption[];
		if (rate.id === '') {
			const created = { ...rate, id: crypto.randomUUID() };
			next = [...rates, created];
			if (rate.isDefault) {
				next = next.map(item => ({ ...item, isDefault: item.id === created.id }));
			}
		} else {
			next = rates.map(item => (item.id === rate.id ? rate : item));
			if (rate.isDefault) {
				next = next.map(item => ({ ...item, isDefault: item.id === rate.id }));
			}
		}
		applyRates(next);
		setEditing(null);
	};

	const setDefault = (id: string) => applyRates(rates.map(rate => ({ ...rate, isDefault: rate.id === id })));

	const toggleActive = (id: string) => {
		const next = rates.map(rate => (rate.id === id ? { ...rate, active: !rate.active } : rate));
		if (!next.some(rate => rate.active)) {
			toast.error('Minimaal één actief tarief', 'Er moet minstens één BTW-tarief actief blijven.');
			return;
		}
		applyRates(next);
	};

	const deleteRate = (id: string) => {
		const next = rates.filter(rate => rate.id !== id);
		if (!next.some(rate => rate.active)) {
			toast.error('Minimaal één actief tarief', 'Er moet minstens één BTW-tarief actief blijven.');
			setConfirmDelete(null);
			return;
		}
		applyRates(next);
		setConfirmDelete(null);
	};

	const toggleReverse = (next: boolean) => {
		setReverseEnabled(next);
		persist(rates, next, reverseLabel);
	};

	const resetToDefaults = () => {
		setRates(DEFAULT_NL_VAT_CONFIG.rates);
		setReverseEnabled(DEFAULT_NL_VAT_CONFIG.reverseChargeEnabled);
		setReverseLabel(DEFAULT_NL_VAT_CONFIG.reverseChargeLabel);
		persist(
			DEFAULT_NL_VAT_CONFIG.rates,
			DEFAULT_NL_VAT_CONFIG.reverseChargeEnabled,
			DEFAULT_NL_VAT_CONFIG.reverseChargeLabel
		);
	};

	return (
		<Paper id='btw-tarieven' variant='outlined' sx={{ p: 0, overflow: 'hidden', scrollMarginTop: 80 }}>
			<Box
				sx={theme => ({
					py: 2.5,
					px: 3,
					borderBottom: `1px solid ${theme.tokens.color.line}`,
					display: 'flex',
					alignItems: 'flex-start',
					justifyContent: 'space-between',
					gap: 2
				})}
			>
				<Box>
					<H3 component='h2' fontWeight='medium' sx={{ fontSize: 16 }}>
						BTW-tarieven
					</H3>
					<BodySmall color='textSecondary' sx={{ display: 'block', mt: 0.5, fontSize: 12, maxWidth: 560 }}>
						De tarieven die je hier instelt zijn beschikbaar in je catalogus en offertes. Het
						standaardtarief wordt vooraf ingevuld op nieuwe regels.
					</BodySmall>
				</Box>
				{isOwner && (
					<Button
						variant='contained'
						startIcon={<AppIcon name='plus' size='small' />}
						onClick={() => setEditing('new')}
						disabled={rates.length >= VAT_RATES_MAX_COUNT}
						sx={{ flexShrink: 0 }}
					>
						Voeg tarief toe
					</Button>
				)}
			</Box>

			<Box sx={{ display: 'flex', flexDirection: 'column' }}>
				{rates.map((rate, index) => (
					<VatRateRow
						key={rate.id}
						option={rate}
						isLast={index === rates.length - 1}
						isOwner={isOwner}
						canDelete={rates.length > 1}
						onEdit={() => setEditing(rate)}
						onSetDefault={() => setDefault(rate.id)}
						onToggleActive={() => toggleActive(rate.id)}
						onDelete={() => setConfirmDelete(rate)}
					/>
				))}
				{rates.length === 0 && (
					<Box sx={{ py: 2.5, px: 3 }}>
						<BodySmall color='textSecondary'>Nog geen tarieven. Voeg er minstens één toe.</BodySmall>
					</Box>
				)}
			</Box>

			<Stack
				useFlexGap
				spacing={2.5}
				sx={theme => ({ py: 2.5, px: 3, borderTop: `1px solid ${theme.tokens.color.line}` })}
			>
				<Box sx={{ maxWidth: 320 }}>
					<StandaloneSelect
						name='vat-default-rate'
						label='Standaardtarief'
						value={defaultRateId}
						options={activeRates.map(rate => ({ id: rate.id, label: formatVatRateLabel(rate.rate) }))}
						onChange={event => setDefault(event.target.value)}
						disabled={!isOwner || activeRates.length === 0}
						fullWidth
					/>
					<BodySmall color='textSecondary' sx={{ display: 'block', mt: 0.75, fontSize: 12 }}>
						Vooraf ingevuld op nieuwe offerte- en catalogusregels.
					</BodySmall>
				</Box>

				<Box sx={theme => ({ borderTop: `1px solid ${theme.tokens.color.line}`, pt: 2.5 })}>
					<StandaloneSwitch
						name='vat-reverse-charge-enabled'
						label='Toon de optie “BTW verlegd” op offerteregels'
						checked={reverseEnabled}
						disabled={!isOwner}
						onChange={toggleReverse}
					/>
					{reverseEnabled && (
						<Box sx={{ mt: 2, maxWidth: 420 }}>
							<StandaloneField
								name='vat-reverse-charge-label'
								label='Label voor verlegde BTW'
								value={reverseLabel}
								onChange={event => setReverseLabel(event.target.value)}
								onBlur={() => persist(rates, reverseEnabled, reverseLabel)}
								disabled={!isOwner}
								maxLength={VAT_REVERSE_CHARGE_LABEL_MAX_LENGTH}
								helperText='Zo verschijnt het op offerteregels en in de totalen.'
								fullWidth
							/>
						</Box>
					)}
				</Box>
			</Stack>

			<Box
				sx={theme => ({
					py: 1.5,
					px: 3,
					borderTop: `1px solid ${theme.tokens.color.line}`,
					bgcolor: theme.tokens.color.paper2,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					gap: 2
				})}
			>
				<BodySmall color='textSecondary' sx={{ fontSize: 12 }}>
					Bestaande offertes behouden hun tarieven — wijzigingen gelden voor nieuwe regels.
				</BodySmall>
				{isOwner && (
					<Button
						variant='text'
						onClick={resetToDefaults}
						startIcon={<AppIcon name='refresh' size='small' />}
						sx={{ flexShrink: 0 }}
					>
						Standaardtarieven herstellen
					</Button>
				)}
			</Box>

			<VatRateModal target={editing} onClose={() => setEditing(null)} onSave={handleSaveRate} />

			<Dialog
				open={confirmDelete !== null}
				title='BTW-tarief verwijderen?'
				width={460}
				onClose={() => setConfirmDelete(null)}
				action={
					<>
						<Button onClick={() => setConfirmDelete(null)}>Annuleren</Button>
						<Button
							variant='contained'
							color='error'
							startIcon={<AppIcon name='trash' size='small' />}
							onClick={() => confirmDelete && deleteRate(confirmDelete.id)}
						>
							Verwijderen
						</Button>
					</>
				}
			>
				<BodySmall sx={{ display: 'block' }}>
					Weet je zeker dat je <strong>{confirmDelete?.label}</strong>
					{confirmDelete ? ` (${formatVatRateLabel(confirmDelete.rate)})` : ''} wilt verwijderen?
				</BodySmall>
				<Box
					sx={theme => ({
						mt: 1.5,
						py: 1.25,
						px: 1.5,
						backgroundColor: theme.tokens.color.paper2,
						border: `1px solid ${theme.tokens.color.line}`,
						borderRadius: `${theme.tokens.radius.sm}px`
					})}
				>
					<BodySmall color='textSecondary' sx={{ fontSize: 13 }}>
						Bestaande offertes en catalogusitems behouden dit tarief. Nieuwe regels gebruiken het
						standaardtarief.
					</BodySmall>
				</Box>
			</Dialog>
		</Paper>
	);
}

interface VatRateRowProps {
	option: VatRateOption;
	isLast: boolean;
	isOwner: boolean;
	canDelete: boolean;
	onEdit: () => void;
	onSetDefault: () => void;
	onToggleActive: () => void;
	onDelete: () => void;
}

function VatRateRow({
	option,
	isLast,
	isOwner,
	canDelete,
	onEdit,
	onSetDefault,
	onToggleActive,
	onDelete
}: VatRateRowProps) {
	const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
	const closeMenu = () => setMenuAnchor(null);
	const inactive = !option.active;

	return (
		<Box
			sx={theme => ({
				py: 1.75,
				px: 3,
				borderBottom: isLast ? 'none' : `1px solid ${theme.tokens.color.line}`,
				display: 'flex',
				alignItems: 'center',
				gap: 2,
				opacity: inactive ? 0.6 : 1
			})}
		>
			<VatBadge rate={option.rate} muted={inactive} />

			<Box sx={{ flex: 1, minWidth: 0 }}>
				<Stack direction='row' useFlexGap spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
					<BodySmall fontWeight='medium'>{option.label}</BodySmall>
					{option.isDefault && (
						<Stack
							direction='row'
							useFlexGap
							spacing={0.5}
							sx={theme => ({
								alignItems: 'center',
								py: 0.25,
								px: 1,
								border: `1px solid ${theme.tokens.color.accent[500]}`,
								borderRadius: `${theme.tokens.radius.sm}px`,
								color: theme.tokens.color.accent[700]
							})}
						>
							<AppIcon name='star' size='small' filled />
							<BodySmall sx={{ fontSize: 11, color: 'inherit' }} fontWeight='medium'>
								Standaard
							</BodySmall>
						</Stack>
					)}
				</Stack>
				<BodySmall color='textSecondary' sx={{ display: 'block', mt: 0.25, fontSize: 12 }}>
					{VAT_KIND_META[option.kind].hint}
				</BodySmall>
			</Box>

			<Stack direction='row' useFlexGap spacing={1} sx={{ alignItems: 'center', flexShrink: 0 }}>
				<BodySmall color='textSecondary' sx={{ fontSize: 12 }}>
					{option.active ? 'Actief' : 'Inactief'}
				</BodySmall>
				<StandaloneSwitch
					name={`vat-active-${option.id}`}
					checked={option.active}
					disabled={!isOwner}
					onChange={() => onToggleActive()}
				/>
			</Stack>

			{isOwner && (
				<>
					<IconButton size='small' aria-label='Acties' onClick={event => setMenuAnchor(event.currentTarget)}>
						<AppIcon name='dots-vertical' size='medium' />
					</IconButton>
					<Menu anchorEl={menuAnchor} open={menuAnchor !== null} onClose={closeMenu}>
						<MenuItem
							sx={{ gap: 1 }}
							onClick={() => {
								closeMenu();
								onEdit();
							}}
						>
							<AppIcon name='pen-line' size='small' />
							Bewerken
						</MenuItem>
						{option.active && !option.isDefault && (
							<MenuItem
								sx={{ gap: 1 }}
								onClick={() => {
									closeMenu();
									onSetDefault();
								}}
							>
								<AppIcon name='star' size='small' />
								Maak standaardtarief
							</MenuItem>
						)}
						<MenuItem
							disabled={!canDelete}
							sx={theme => ({ gap: 1, color: theme.tokens.color.lost[700] })}
							onClick={() => {
								closeMenu();
								onDelete();
							}}
						>
							<AppIcon name='trash' size='small' />
							Verwijderen
						</MenuItem>
					</Menu>
				</>
			)}
		</Box>
	);
}

function VatBadge({ rate, muted }: { rate: number; muted: boolean }) {
	return (
		<Box
			className='tabular'
			sx={theme => ({
				flexShrink: 0,
				display: 'inline-flex',
				alignItems: 'center',
				justifyContent: 'center',
				width: 44,
				height: 40,
				borderRadius: `${theme.tokens.radius.md}px`,
				backgroundColor: muted ? theme.tokens.color.paper2 : theme.tokens.color.accent[50],
				border: `1px solid ${muted ? theme.tokens.color.line : theme.tokens.color.accent[500]}`,
				color: muted ? theme.tokens.color.ink4 : theme.tokens.color.accent[700],
				fontWeight: 600,
				fontSize: 14
			})}
		>
			{formatVatRateLabel(rate)}
		</Box>
	);
}

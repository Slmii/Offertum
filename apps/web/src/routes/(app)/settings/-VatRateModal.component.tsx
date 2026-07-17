import { AppIcon } from '@/components/AppIcon.component';
import { Dialog } from '@/components/Dialog.component';
import { StandaloneField } from '@/components/Form/Field/Field.component';
import { StandaloneSelect } from '@/components/Form/Select/Select.component';
import { StandaloneSwitch } from '@/components/Form/Switch/Switch.component';
import { BodySmall } from '@/components/Text.component';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import {
	VAT_KIND_META,
	VAT_RATE_KINDS,
	VAT_RATE_LABEL_MAX_LENGTH,
	VAT_RATE_MIN,
	VAT_RATE_UI_MAX,
	type VatRateKind,
	type VatRateOption
} from '@offertum/shared';
import { useState } from 'react';

/** The row being edited, or `'new'` for an add. `null` keeps the (always-mounted) dialog closed. */
export type VatRateEditTarget = VatRateOption | 'new' | null;

interface VatRateFormDraft {
	id: string | null;
	label: string;
	kind: VatRateKind;
	/** Kept as a string while typing; parsed to an integer on save. */
	rate: string;
	isDefault: boolean;
	active: boolean;
}

function draftFor(target: VatRateEditTarget): VatRateFormDraft {
	if (target === 'new' || target === null) {
		return { id: null, label: '', kind: 'standard', rate: '21', isDefault: false, active: true };
	}

	return {
		id: target.id,
		label: target.label,
		kind: target.kind,
		rate: String(target.rate),
		isDefault: target.isDefault,
		active: target.active
	};
}

const KIND_OPTIONS = VAT_RATE_KINDS.map(kind => ({ id: kind, label: VAT_KIND_META[kind].label }));

interface VatRateModalProps {
	target: VatRateEditTarget;
	onClose: () => void;
	onSave: (rate: VatRateOption) => void;
}

/**
 * Add / edit modal for a single BTW rate. Category (Soort) suggests a name + percentage; the
 * Standaard and Actief toggles are kept consistent (a default rate is always active; deactivating a
 * rate clears its default flag). Renders unconditionally — visibility is driven by `target`.
 */
export function VatRateModal({ target, onClose, onSave }: VatRateModalProps) {
	const isNew = target === 'new';
	const [seedKey, setSeedKey] = useState<string | null>(null);
	const [form, setForm] = useState<VatRateFormDraft>(() => draftFor(target));

	// Re-seed the form when the modal opens on a different target (adjust-state-during-render). On
	// close, clear seedKey so reopening the SAME row re-seeds from the server value instead of
	// reusing the canceled, unsaved local edits.
	const key = target === null ? null : target === 'new' ? 'new' : target.id;
	if (target === null) {
		if (seedKey !== null) {
			setSeedKey(null);
		}
	} else if (key !== seedKey) {
		setSeedKey(key);
		setForm(draftFor(target));
	}

	const update = (patch: Partial<VatRateFormDraft>) => setForm(current => ({ ...current, ...patch }));

	const changeKind = (kind: VatRateKind) => {
		const meta = VAT_KIND_META[kind];
		const previousMeta = VAT_KIND_META[form.kind];
		const patch: Partial<VatRateFormDraft> = { kind };
		// Only overwrite label / percentage the user hasn't customized — i.e. still empty or still the
		// previous kind's suggested value. Otherwise switching to "Verlaagd tarief" would keep the 21%
		// a new row starts with.
		if (form.label.trim().length === 0 || form.label === previousMeta.label) {
			patch.label = meta.label;
		}
		if (form.rate.trim().length === 0 || form.rate === String(previousMeta.suggestedRate)) {
			patch.rate = String(meta.suggestedRate);
		}
		update(patch);
	};

	const trimmedLabel = form.label.trim();
	const labelError =
		trimmedLabel.length === 0
			? 'Geef het tarief een naam.'
			: trimmedLabel.length > VAT_RATE_LABEL_MAX_LENGTH
				? 'Naam is te lang.'
				: undefined;

	const rateNumber = Number(form.rate);
	const rateError =
		form.rate.trim().length === 0 ||
		!Number.isInteger(rateNumber) ||
		rateNumber < VAT_RATE_MIN ||
		rateNumber > VAT_RATE_UI_MAX
			? `Vul een geheel getal tussen ${VAT_RATE_MIN} en ${VAT_RATE_UI_MAX} in.`
			: undefined;

	const hasError = Boolean(labelError || rateError);

	const submit = () => {
		if (hasError) {
			return;
		}
		onSave({
			id: form.id ?? '',
			label: trimmedLabel,
			kind: form.kind,
			rate: rateNumber,
			isDefault: form.isDefault,
			active: form.active
		});
	};

	return (
		<Dialog
			open={target !== null}
			width={520}
			onClose={onClose}
			title={
				<Stack direction='row' useFlexGap spacing={1.25} sx={{ alignItems: 'center' }}>
					<Box
						sx={theme => ({
							display: 'inline-flex',
							alignItems: 'center',
							justifyContent: 'center',
							width: 24,
							height: 24,
							borderRadius: `${theme.tokens.radius.sm}px`,
							backgroundColor: theme.tokens.color.accent[50],
							color: theme.tokens.color.accent[700]
						})}
					>
						<AppIcon name='percent' size='small' />
					</Box>
					{isNew ? 'BTW-tarief toevoegen' : 'BTW-tarief bewerken'}
				</Stack>
			}
			action={
				<>
					<Button onClick={onClose}>Annuleren</Button>
					<Button variant='contained' onClick={submit} disabled={hasError}>
						Opslaan
					</Button>
				</>
			}
		>
			<Stack useFlexGap spacing={2}>
				<Box sx={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 2, alignItems: 'start' }}>
					<StandaloneSelect
						name='vat-rate-kind'
						label='Soort'
						value={form.kind}
						options={KIND_OPTIONS}
						onChange={event => changeKind(event.target.value as VatRateKind)}
						helperText={VAT_KIND_META[form.kind].hint}
						fullWidth
					/>
					<StandaloneField
						name='vat-rate-percentage'
						label='Percentage'
						required
						value={form.rate}
						onChange={event => update({ rate: event.target.value.replace(/[^\d]/g, '') })}
						error={rateError}
						endElement={
							<BodySmall color='textSecondary' component='span'>
								%
							</BodySmall>
						}
						placeholder='21'
					/>
				</Box>

				<StandaloneField
					name='vat-rate-label'
					label='Naam'
					required
					value={form.label}
					onChange={event => update({ label: event.target.value })}
					error={labelError}
					helperText='Zoals het op de offerte en in de keuzelijst verschijnt.'
					maxLength={VAT_RATE_LABEL_MAX_LENGTH}
					placeholder='Bijv. Standaardtarief'
				/>

				<Stack useFlexGap spacing={1.25}>
					<ToggleRow
						title='Standaardtarief'
						description='Vooraf ingevuld op nieuwe offerte- en catalogusregels.'
						checked={form.isDefault}
						onChange={next => update({ isDefault: next, active: next ? true : form.active })}
						name='vat-rate-default'
					/>
					<ToggleRow
						title='Actief'
						description='Inactieve tarieven verschijnen niet in keuzelijsten.'
						checked={form.active}
						onChange={next => update({ active: next, isDefault: next ? form.isDefault : false })}
						name='vat-rate-active'
					/>
				</Stack>
			</Stack>
		</Dialog>
	);
}

interface ToggleRowProps {
	title: string;
	description: string;
	name: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
}

function ToggleRow({ title, description, name, checked, onChange }: ToggleRowProps) {
	return (
		<Stack
			direction='row'
			useFlexGap
			spacing={1.5}
			sx={theme => ({
				alignItems: 'center',
				justifyContent: 'space-between',
				py: 1.25,
				px: 1.75,
				border: `1px solid ${theme.tokens.color.line}`,
				borderRadius: `${theme.tokens.radius.md}px`,
				backgroundColor: theme.tokens.color.surface
			})}
		>
			<Box>
				<BodySmall fontWeight='medium' sx={{ display: 'block' }}>
					{title}
				</BodySmall>
				<BodySmall color='textSecondary' sx={{ display: 'block', fontSize: 12 }}>
					{description}
				</BodySmall>
			</Box>
			<StandaloneSwitch name={name} checked={checked} onChange={onChange} />
		</Stack>
	);
}

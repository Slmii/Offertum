import { AppIcon } from '@/components/AppIcon.component';
import { StandaloneField } from '@/components/Form/Field/Field.component';
import { StandaloneSelect } from '@/components/Form/Select/Select.component';
import { StandaloneSwitch } from '@/components/Form/Switch/Switch.component';
import { BodySmall, H3 } from '@/components/Text.component';
import { useToast } from '@/lib/hooks/use-toast';
import { useUpdateVatSettings, vatSettingsQueryOptions } from '@/lib/queries/vat-settings.queries';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import {
	formatVatRateLabel,
	VAT_RATE_MAX,
	VAT_RATE_MIN,
	VAT_RATES_MAX_COUNT,
	VAT_REVERSE_CHARGE_LABEL_MAX_LENGTH
} from '@offertum/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useState } from 'react';

const RATE_PATTERN = /^\d{1,3}([.,]\d{1,2})?$/;

/** Parse a user-typed rate ("9", "5,5") to a number, or null if invalid / out of range. */
function parseRate(raw: string): number | null {
	const trimmed = raw.trim();
	if (!RATE_PATTERN.test(trimmed)) {
		return null;
	}
	const value = Number(trimmed.replace(',', '.'));
	if (Number.isNaN(value) || value < VAT_RATE_MIN || value > VAT_RATE_MAX) {
		return null;
	}
	return value;
}

/**
 * "BTW-tarieven" section on the Business details page — the org's configurable VAT rates, default
 * rate, and reverse-charge option. Owner-only editing (members see it read-only). Self-contained:
 * owns its query + mutation. Local state is re-seeded from the server when the query data changes.
 */
export function VatSettingsSection({ isOwner }: { isOwner: boolean }) {
	const { data } = useSuspenseQuery(vatSettingsQueryOptions);
	const update = useUpdateVatSettings();
	const toast = useToast();

	const [seed, setSeed] = useState(data);
	const [rates, setRates] = useState(data.rates);
	const [defaultRate, setDefaultRate] = useState(data.defaultRate);
	const [reverseEnabled, setReverseEnabled] = useState(data.reverseChargeEnabled);
	const [reverseLabel, setReverseLabel] = useState(data.reverseChargeLabel);
	const [newRate, setNewRate] = useState('');
	const [savedFlash, setSavedFlash] = useState(false);

	// Re-seed local state when the server config changes (e.g. after a save refetch).
	if (data !== seed) {
		setSeed(data);
		setRates(data.rates);
		setDefaultRate(data.defaultRate);
		setReverseEnabled(data.reverseChargeEnabled);
		setReverseLabel(data.reverseChargeLabel);
	}

	const addRate = () => {
		const parsed = parseRate(newRate);
		if (parsed === null) {
			toast.error('Ongeldig tarief', `Vul een getal in tussen ${VAT_RATE_MIN} en ${VAT_RATE_MAX}.`);
			return;
		}
		if (rates.includes(parsed)) {
			setNewRate('');
			return;
		}
		setRates([...rates, parsed]);
		setNewRate('');
	};

	const removeRate = (rate: number) => {
		const next = rates.filter(r => r !== rate);
		setRates(next);
		const [firstRate] = next;
		if (defaultRate === rate && firstRate !== undefined) {
			setDefaultRate(firstRate);
		}
	};

	const save = () => {
		update.mutate(
			{
				rates,
				defaultRate,
				reverseChargeEnabled: reverseEnabled,
				reverseChargeLabel: reverseLabel.trim()
			},
			{
				onSuccess: () => {
					setSavedFlash(true);
					window.setTimeout(() => setSavedFlash(false), 2500);
				},
				onError: error =>
					toast.error('Opslaan mislukt', error instanceof Error ? error.message : 'Probeer het opnieuw.')
			}
		);
	};

	const canSave =
		isOwner &&
		rates.length > 0 &&
		rates.length <= VAT_RATES_MAX_COUNT &&
		rates.includes(defaultRate) &&
		reverseLabel.trim().length > 0 &&
		reverseLabel.trim().length <= VAT_REVERSE_CHARGE_LABEL_MAX_LENGTH;

	return (
		<Paper id='btw-tarieven' variant='outlined' sx={{ p: 6, borderRadius: 2, scrollMarginTop: 80 }}>
			<H3 component='h2'>BTW-tarieven</H3>
			<BodySmall color='textSecondary' sx={{ display: 'block', mt: 0.75, mb: 3, maxWidth: 640 }}>
				De BTW-tarieven die je kunt kiezen op offerteregels en catalogusitems. Pas ze aan voor je eigen land.
				Het standaardtarief wordt voorgeselecteerd bij een nieuwe regel.
			</BodySmall>

			<Stack useFlexGap spacing={3}>
				<Box>
					<BodySmall fontWeight='bold' sx={{ display: 'block', mb: 1 }}>
						Toegestane tarieven
					</BodySmall>
					<Stack direction='row' useFlexGap spacing={1} sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
						{rates.map(rate => (
							<Stack
								key={rate}
								direction='row'
								useFlexGap
								spacing={0.5}
								sx={theme => ({
									alignItems: 'center',
									pl: 1.25,
									pr: 0.5,
									py: 0.25,
									borderRadius: `${theme.tokens.radius.sm}px`,
									backgroundColor: theme.tokens.color.paper2,
									border: `1px solid ${theme.tokens.color.line}`
								})}
							>
								<BodySmall className='tabular'>{formatVatRateLabel(rate)}</BodySmall>
								{isOwner && (
									<IconButton
										size='small'
										aria-label={`Verwijder ${formatVatRateLabel(rate)}`}
										onClick={() => removeRate(rate)}
									>
										<AppIcon name='x' size='small' />
									</IconButton>
								)}
							</Stack>
						))}
						{rates.length === 0 && <BodySmall color='textSecondary'>Nog geen tarieven.</BodySmall>}
					</Stack>

					{isOwner && rates.length < VAT_RATES_MAX_COUNT && (
						<Stack
							direction='row'
							useFlexGap
							spacing={1}
							sx={{ alignItems: 'center', mt: 1.5, maxWidth: 320 }}
						>
							<StandaloneField
								name='new-vat-rate'
								value={newRate}
								onChange={event => setNewRate(event.target.value)}
								onKeyDown={event => {
									if (event.key === 'Enter') {
										event.preventDefault();
										addRate();
									}
								}}
								placeholder='Bijv. 21 of 5,5'
								size='small'
								fullWidth
							/>
							<Button
								variant='outlined'
								onClick={addRate}
								startIcon={<AppIcon name='plus' size='small' />}
								sx={{ flexShrink: 0 }}
							>
								Tarief
							</Button>
						</Stack>
					)}
				</Box>

				<Box sx={{ maxWidth: 320 }}>
					<StandaloneSelect
						name='default-vat-rate'
						label='Standaardtarief'
						value={String(defaultRate)}
						options={rates.map(rate => ({ id: String(rate), label: formatVatRateLabel(rate) }))}
						onChange={event => setDefaultRate(Number(event.target.value))}
						disabled={!isOwner || rates.length === 0}
						fullWidth
					/>
				</Box>

				<Box>
					<StandaloneSwitch
						name='vat-reverse-charge-enabled'
						label='Toon de optie "BTW verlegd" op offerteregels'
						checked={reverseEnabled}
						disabled={!isOwner}
						onChange={setReverseEnabled}
					/>
					{reverseEnabled && (
						<Box sx={{ mt: 1.5, maxWidth: 320 }}>
							<StandaloneField
								name='vat-reverse-charge-label'
								label='Label voor verlegde BTW'
								value={reverseLabel}
								onChange={event => setReverseLabel(event.target.value)}
								size='small'
								disabled={!isOwner}
								fullWidth
							/>
						</Box>
					)}
				</Box>

				{isOwner && (
					<Stack direction='row' useFlexGap spacing={2} sx={{ alignItems: 'center' }}>
						<Button
							variant='contained'
							onClick={save}
							disabled={!canSave || update.isPending}
							startIcon={update.isPending ? <CircularProgress size={14} color='inherit' /> : null}
						>
							{update.isPending ? 'Opslaan…' : 'Opslaan'}
						</Button>
						{savedFlash && (
							<BodySmall sx={theme => ({ color: theme.tokens.color.won[700] })}>Opgeslagen.</BodySmall>
						)}
					</Stack>
				)}
			</Stack>
		</Paper>
	);
}

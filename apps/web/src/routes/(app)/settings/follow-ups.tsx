import { followUpSettingsQueryOptions, useUpdateFollowUpSettings } from '@/lib/queries/follow-up-settings.queries';
import { myMembershipQueryOptions } from '@/lib/queries/team.queries';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import {
	FOLLOW_UP_CADENCE_DAYS_MAX,
	FOLLOW_UP_CADENCE_DAYS_MIN,
	FOLLOW_UP_MAX_COUNT_MAX,
	FOLLOW_UP_MAX_COUNT_MIN
} from '@quoteom/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useState } from 'react';

/**
 * W6.2 — Per-org follow-up cadence + cap. Owner-only at the route level (mirrors the
 * API guard); members get bounced back to `/settings/email` so they don't see a page
 * that won't accept their writes.
 */
export const Route = createFileRoute('/(app)/settings/follow-ups')({
	beforeLoad: async ({ context }) => {
		const me = await context.queryClient.ensureQueryData(myMembershipQueryOptions);
		if (me.role !== 'OWNER') {
			throw redirect({ to: '/settings/email' });
		}
	},
	loader: ({ context }) => context.queryClient.ensureQueryData(followUpSettingsQueryOptions),
	component: FollowUpsSettingsPage
});

const PRESET_CADENCES = [3, 5, 7] as const;

function FollowUpsSettingsPage() {
	const { data } = useSuspenseQuery(followUpSettingsQueryOptions);
	const update = useUpdateFollowUpSettings();

	const [cadenceDays, setCadenceDays] = useState<number>(data.cadenceDays);
	const [maxCount, setMaxCount] = useState<number>(data.maxCount);
	const [savedFlash, setSavedFlash] = useState(false);

	const cadencePreset = PRESET_CADENCES.includes(cadenceDays as (typeof PRESET_CADENCES)[number])
		? String(cadenceDays)
		: 'custom';

	const dirty = cadenceDays !== data.cadenceDays || maxCount !== data.maxCount;
	const isInvalid =
		!Number.isInteger(cadenceDays) ||
		cadenceDays < FOLLOW_UP_CADENCE_DAYS_MIN ||
		cadenceDays > FOLLOW_UP_CADENCE_DAYS_MAX ||
		!Number.isInteger(maxCount) ||
		maxCount < FOLLOW_UP_MAX_COUNT_MIN ||
		maxCount > FOLLOW_UP_MAX_COUNT_MAX;

	const onSave = () => {
		update.mutate(
			{ cadenceDays, maxCount },
			{
				onSuccess: () => {
					setSavedFlash(true);
					window.setTimeout(() => setSavedFlash(false), 2500);
				}
			}
		);
	};

	const onCadencePresetChange = (next: string) => {
		if (next === 'custom') {
			return;
		}
		const parsed = Number(next);
		if (Number.isInteger(parsed)) {
			setCadenceDays(parsed);
		}
	};

	const schedulerDisabled = maxCount === 0;

	return (
		<Container maxWidth='sm' sx={{ py: 6 }}>
			<Box sx={{ mb: 'var(--space-6)' }}>
				<Typography variant='h1' sx={{ fontSize: '2.25rem', mb: 'var(--space-2)' }}>
					Automatische follow-ups
				</Typography>
				<Typography sx={{ color: 'var(--ink-3)', fontSize: 14, maxWidth: 480 }}>
					Quoteom kan automatisch een korte herinnering schrijven als een klant na je antwoord stil blijft.
					Jij beoordeelt en verstuurt — niets gaat zonder jouw klik de deur uit.
				</Typography>
			</Box>

			<Paper
				variant='outlined'
				sx={{
					padding: 'var(--space-6)',
					borderRadius: 'var(--radius-md)',
					boxShadow: 'var(--shadow-1)',
					background: 'var(--surface)'
				}}
			>
				<Stack spacing='var(--space-5)'>
					<Box>
						<Typography
							variant='overline'
							sx={{ color: 'var(--ink-3)', fontSize: 11, display: 'block', mb: 'var(--space-2)' }}
						>
							Cadans
						</Typography>
						<Typography sx={{ fontSize: 13, color: 'var(--ink-3)', mb: 'var(--space-3)' }}>
							Hoeveel dagen stilte voordat Quoteom een herinnering opstelt.
						</Typography>
						<Stack direction='row' spacing='var(--space-2)' sx={{ alignItems: 'center' }}>
							<Select
								size='small'
								value={cadencePreset}
								onChange={e => onCadencePresetChange(String(e.target.value))}
								disabled={schedulerDisabled}
								sx={{ minWidth: 140 }}
							>
								{PRESET_CADENCES.map(days => (
									<MenuItem key={days} value={String(days)}>
										Elke {days} dagen
									</MenuItem>
								))}
								<MenuItem value='custom'>Aangepast</MenuItem>
							</Select>
							<TextField
								type='number'
								size='small'
								value={cadenceDays}
								onChange={e => {
									const parsed = Number(e.target.value);
									if (Number.isFinite(parsed)) {
										setCadenceDays(parsed);
									}
								}}
								disabled={schedulerDisabled}
								slotProps={{
									htmlInput: {
										min: FOLLOW_UP_CADENCE_DAYS_MIN,
										max: FOLLOW_UP_CADENCE_DAYS_MAX,
										step: 1
									}
								}}
								sx={{ width: 96 }}
							/>
							<Typography sx={{ fontSize: 13, color: 'var(--ink-3)' }}>dagen</Typography>
						</Stack>
						{schedulerDisabled && (
							<Typography
								sx={{ fontSize: 12, color: 'var(--ink-4)', mt: 'var(--space-2)', fontStyle: 'italic' }}
							>
								Geen effect zolang de scheduler uitstaat (maximum = 0).
							</Typography>
						)}
					</Box>

					<Box>
						<Typography
							variant='overline'
							sx={{ color: 'var(--ink-3)', fontSize: 11, display: 'block', mb: 'var(--space-2)' }}
						>
							Maximum
						</Typography>
						<Typography sx={{ fontSize: 13, color: 'var(--ink-3)', mb: 'var(--space-3)' }}>
							Het aantal herinneringen dat Quoteom maximaal per offerteaanvraag mag opstellen. Zet op{' '}
							<strong>0</strong> om de scheduler volledig uit te zetten.
						</Typography>
						<Stack direction='row' spacing='var(--space-2)' sx={{ alignItems: 'center' }}>
							<TextField
								type='number'
								size='small'
								value={maxCount}
								onChange={e => {
									const parsed = Number(e.target.value);
									if (Number.isFinite(parsed)) {
										setMaxCount(parsed);
									}
								}}
								slotProps={{
									htmlInput: {
										min: FOLLOW_UP_MAX_COUNT_MIN,
										max: FOLLOW_UP_MAX_COUNT_MAX,
										step: 1
									}
								}}
								sx={{ width: 96 }}
							/>
							<Typography sx={{ fontSize: 13, color: 'var(--ink-3)' }}>
								{maxCount === 1 ? 'herinnering' : 'herinneringen'}
							</Typography>
						</Stack>
					</Box>

					{schedulerDisabled && (
						<Alert severity='warning'>
							De scheduler staat uit. Quoteom maakt geen automatische herinneringen tot je dit weer
							aanzet.
						</Alert>
					)}

					{!schedulerDisabled && (
						<Box
							sx={{
								padding: 'var(--space-4)',
								background: 'var(--paper-2)',
								borderRadius: 'var(--radius-sm)',
								border: '1px solid var(--line)'
							}}
						>
							<Typography sx={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.5 }}>
								<Box component='span' sx={{ color: 'text.primary', fontWeight: 500 }}>
									Voorbeeld:
								</Box>{' '}
								je verstuurt vandaag een offerte. Reageert de klant niet, dan zet Quoteom over{' '}
								{cadenceDays} dagen een eerste herinnering klaar
								{maxCount > 1 ? `, en na nog ${cadenceDays} dagen een tweede` : ''}
								{maxCount > 2 ? `, tot maximaal ${maxCount} herinneringen` : ''}. De herinneringen staan
								in je inbox; jij beoordeelt en verstuurt.
							</Typography>
						</Box>
					)}

					{update.error && (
						<Alert severity='error'>
							{update.error instanceof Error ? update.error.message : 'Opslaan mislukt.'}
						</Alert>
					)}
					{savedFlash && <Alert severity='success'>Opgeslagen.</Alert>}

					<Stack direction='row' spacing='var(--space-2)' sx={{ justifyContent: 'flex-end' }}>
						<Button variant='contained' onClick={onSave} disabled={!dirty || isInvalid || update.isPending}>
							{update.isPending ? 'Opslaan…' : 'Opslaan'}
						</Button>
					</Stack>
				</Stack>
			</Paper>
		</Container>
	);
}

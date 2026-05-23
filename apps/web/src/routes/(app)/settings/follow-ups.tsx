import { SectionError } from '@/components/SectionError.component';
import { Field } from '@/components/Form/Field/Field.component';
import { Form } from '@/components/Form/Form.component';
import { Select } from '@/components/Form/Select/Select.component';
import { followUpSettingsQueryOptions, useUpdateFollowUpSettings } from '@/lib/queries/follow-up-settings.queries';
import { myMembershipQueryOptions } from '@/lib/queries/team.queries';
import { FollowUpSettingsSchema, type FollowUpSettingsForm } from '@/lib/schemas/follow-up-settings.schema';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';

/**
 * Per-org follow-up cadence + cap. Owner-only at the route level (mirrors the
 * API guard); members get bounced back to `/settings/email` so they don't see a page
 * that won't accept their writes.
 * Form composition: every input — `cadenceDays`, `maxCount`, and the preset dropdown —
 * goes through `react-hook-form` via the in-house `<Field>` / `<Select>` components.
 * `cadencePreset` lives in the form state (Zod schema marks it as a UI-only string)
 * so picking a preset can call `setValue('cadenceDays', N)` and stay in sync.
 */
export const Route = createFileRoute('/(app)/settings/follow-ups')({
	beforeLoad: async ({ context }) => {
		const me = await context.queryClient.ensureQueryData(myMembershipQueryOptions);
		if (me.role !== 'OWNER') {
			throw redirect({ to: '/settings/email' });
		}
	},
	loader: ({ context }) => context.queryClient.ensureQueryData(followUpSettingsQueryOptions),
	component: FollowUpsSettingsPage,
	errorComponent: SectionError
});

const PRESET_CADENCES = [3, 5, 7] as const;
const CADENCE_PRESET_OPTIONS = [
	...PRESET_CADENCES.map(days => ({ id: String(days), label: `Elke ${days} dagen` })),
	{ id: 'custom', label: 'Aangepast' }
];

function presetFor(cadenceDays: number) {
	return PRESET_CADENCES.includes(cadenceDays as (typeof PRESET_CADENCES)[number]) ? String(cadenceDays) : 'custom';
}

function FollowUpsSettingsPage() {
	const { data } = useSuspenseQuery(followUpSettingsQueryOptions);
	const update = useUpdateFollowUpSettings();
	const [savedFlash, setSavedFlash] = useState(false);

	const onSubmit = (values: FollowUpSettingsForm) => {
		// `cadencePreset` is UI-only — drop it before sending the API payload.
		update.mutate(
			{
				cadenceDays: values.cadenceDays,
				maxCount: values.maxCount,
				coldAfterDays: values.coldAfterDays
			},
			{
				onSuccess: () => {
					setSavedFlash(true);
					window.setTimeout(() => setSavedFlash(false), 2500);
				}
			}
		);
	};

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
				<Form<FollowUpSettingsForm>
					action={onSubmit}
					schema={FollowUpSettingsSchema}
					defaultValues={{
						cadenceDays: data.cadenceDays,
						maxCount: data.maxCount,
						coldAfterDays: data.coldAfterDays,
						cadencePreset: presetFor(data.cadenceDays)
					}}
				>
					<SettingsBody savedFlash={savedFlash} isSaving={update.isPending} error={update.error} />
				</Form>
			</Paper>
		</Container>
	);
}

interface SettingsBodyProps {
	isSaving: boolean;
	savedFlash: boolean;
	error: Error | null;
}

function SettingsBody({ isSaving, savedFlash, error }: SettingsBodyProps) {
	const { setValue } = useFormContext<FollowUpSettingsForm>();
	const cadenceDays = useWatch<FollowUpSettingsForm, 'cadenceDays'>({ name: 'cadenceDays' }) ?? 0;
	const maxCount = useWatch<FollowUpSettingsForm, 'maxCount'>({ name: 'maxCount' }) ?? 0;
	const coldAfterDays = useWatch<FollowUpSettingsForm, 'coldAfterDays'>({ name: 'coldAfterDays' }) ?? 0;
	const schedulerDisabled = maxCount === 0;

	return (
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
				<Stack direction='row' spacing='var(--space-2)' sx={{ alignItems: 'flex-start' }}>
					<Box sx={{ minWidth: 160 }}>
						<Select
							name='cadencePreset'
							options={CADENCE_PRESET_OPTIONS}
							disabled={schedulerDisabled}
							fullWidth
							onChange={next => {
								if (next === 'custom') {
									return;
								}
								const parsed = Number(next);
								if (Number.isInteger(parsed)) {
									setValue('cadenceDays', parsed, { shouldDirty: true, shouldValidate: true });
								}
							}}
						/>
					</Box>
					<Box sx={{ width: 120 }}>
						<Field
							name='cadenceDays'
							type='number'
							disabled={schedulerDisabled}
							fullWidth
							onChange={value => {
								// Manual edits revert preset to "custom" if the new value isn't one of
								// the presets; keeps the dropdown honest about what's actually set.
								const parsed = Number(value);
								if (!Number.isFinite(parsed)) {
									return;
								}
								setValue('cadencePreset', presetFor(parsed), { shouldDirty: true });
							}}
						/>
					</Box>
					<Typography sx={{ fontSize: 13, color: 'var(--ink-3)', alignSelf: 'center' }}>dagen</Typography>
				</Stack>
				{schedulerDisabled && (
					<Typography sx={{ fontSize: 12, color: 'var(--ink-4)', mt: 'var(--space-2)', fontStyle: 'italic' }}>
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
					<Box sx={{ width: 120 }}>
						<Field name='maxCount' type='number' fullWidth />
					</Box>
					<Typography sx={{ fontSize: 13, color: 'var(--ink-3)' }}>
						{maxCount === 1 ? 'herinnering' : 'herinneringen'}
					</Typography>
				</Stack>
			</Box>

			<Box>
				<Typography
					variant='overline'
					sx={{ color: 'var(--ink-3)', fontSize: 11, display: 'block', mb: 'var(--space-2)' }}
				>
					Automatisch koud markeren
				</Typography>
				<Typography sx={{ fontSize: 13, color: 'var(--ink-3)', mb: 'var(--space-3)' }}>
					Na deze stilteperiode (zonder klantreactie en met alle herinneringen verstuurd) zet Quoteom de
					offerteaanvraag automatisch op <strong>Koud</strong>. Zet op <strong>0</strong> om dit uit te zetten
					— je houdt opportunities dan zelf bij.
				</Typography>
				<Stack direction='row' spacing='var(--space-2)' sx={{ alignItems: 'center' }}>
					<Box sx={{ width: 120 }}>
						<Field name='coldAfterDays' type='number' fullWidth />
					</Box>
					<Typography sx={{ fontSize: 13, color: 'var(--ink-3)' }}>
						{coldAfterDays === 1 ? 'dag' : 'dagen'} na laatste verzending
					</Typography>
				</Stack>
				{coldAfterDays === 0 && (
					<Typography sx={{ fontSize: 12, color: 'var(--ink-4)', mt: 'var(--space-2)', fontStyle: 'italic' }}>
						Automatisch koud markeren staat uit.
					</Typography>
				)}
			</Box>

			{schedulerDisabled && (
				<Alert severity='warning'>
					De scheduler staat uit. Quoteom maakt geen automatische herinneringen tot je dit weer aanzet.
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
						je verstuurt vandaag een offerte. Reageert de klant niet, dan zet Quoteom over {cadenceDays}{' '}
						dagen een eerste herinnering klaar
						{maxCount > 1 ? `, en na nog ${cadenceDays} dagen een tweede` : ''}
						{maxCount > 2 ? `, tot maximaal ${maxCount} herinneringen` : ''}. De herinneringen staan in je
						inbox; jij beoordeelt en verstuurt.
					</Typography>
				</Box>
			)}

			{error && <Alert severity='error'>{error instanceof Error ? error.message : 'Opslaan mislukt.'}</Alert>}
			{savedFlash && <Alert severity='success'>Opgeslagen.</Alert>}

			<Stack direction='row' spacing='var(--space-2)' sx={{ justifyContent: 'flex-end' }}>
				<Button type='submit' variant='contained' disabled={isSaving}>
					{isSaving ? 'Opslaan…' : 'Opslaan'}
				</Button>
			</Stack>
		</Stack>
	);
}

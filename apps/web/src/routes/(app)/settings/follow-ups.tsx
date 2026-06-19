import { Banner } from '@/components/Banner.component';
import { Field } from '@/components/Form/Field/Field.component';
import { Form } from '@/components/Form/Form.component';
import { Select } from '@/components/Form/Select/Select.component';
import { PageHeader } from '@/components/PageContainer.component';
import { SectionError } from '@/components/SectionError.component';
import { BodySmall, Overline } from '@/components/Text.component';
import { followUpSettingsQueryOptions, useUpdateFollowUpSettings } from '@/lib/queries/follow-up-settings.queries';
import { myMembershipQueryOptions } from '@/lib/queries/team.queries';
import { FollowUpSettingsSchema, type FollowUpSettingsForm } from '@/lib/schemas/follow-up-settings.schema';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';

/**
 * Per-org follow-up cadence + cap. Owner-only at the route level (mirrors the
 * API guard); members get bounced back to `/` so they don't see a page
 * that won't accept their writes.
 * Form composition: every input, `cadenceDays`, `maxCount`, and the preset dropdown —
 * goes through `react-hook-form` via the in-house `<Field>` / `<Select>` components.
 * `cadencePreset` lives in the form state (Zod schema marks it as a UI-only string)
 * so picking a preset can call `setValue('cadenceDays', N)` and stay in sync.
 */
export const Route = createFileRoute('/(app)/settings/follow-ups')({
	beforeLoad: async ({ context }) => {
		const me = await context.queryClient.ensureQueryData(myMembershipQueryOptions);
		if (me.role !== 'OWNER') {
			throw redirect({ to: '/' });
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
		// `cadencePreset` is UI-only, drop it before sending the API payload.
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
		<Stack>
			<PageHeader
				title='Automatische follow-ups'
				caption='Offertum kan automatisch een korte herinnering schrijven als een klant na je antwoord stil blijft. Jij beoordeelt en verstuurt, niets gaat zonder jouw klik de deur uit.'
			/>

			<Paper variant='outlined' sx={{ p: 6, borderRadius: 2, boxShadow: 1 }}>
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
		</Stack>
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
		<Stack useFlexGap spacing={5}>
			<Box>
				<Overline color='text.secondary' sx={{ display: 'block', mb: 2 }}>
					Cadans
				</Overline>
				<BodySmall color='text.secondary' sx={{ mb: 3 }}>
					Hoeveel dagen stilte voordat Offertum een herinnering opstelt.
				</BodySmall>
				<Stack direction='row' useFlexGap spacing={2} sx={{ alignItems: 'flex-start' }}>
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
					<BodySmall color='text.secondary' sx={{ alignSelf: 'center' }}>
						dagen
					</BodySmall>
				</Stack>
				{schedulerDisabled && (
					<BodySmall color='text.disabled' sx={{ mt: 2, fontStyle: 'italic', display: 'block' }}>
						Geen effect zolang de scheduler uitstaat (maximum = 0).
					</BodySmall>
				)}
			</Box>

			<Box>
				<Overline color='text.secondary' sx={{ display: 'block', mb: 2 }}>
					Maximum
				</Overline>
				<BodySmall color='text.secondary' sx={{ mb: 3 }}>
					Het aantal herinneringen dat Offertum maximaal per offerteaanvraag mag opstellen. Zet op{' '}
					<strong>0</strong> om de scheduler volledig uit te zetten.
				</BodySmall>
				<Stack direction='row' useFlexGap spacing={2} sx={{ alignItems: 'center' }}>
					<Box sx={{ width: 120 }}>
						<Field name='maxCount' type='number' fullWidth />
					</Box>
					<BodySmall color='text.secondary'>{maxCount === 1 ? 'herinnering' : 'herinneringen'}</BodySmall>
				</Stack>
				<BodySmall color='text.secondary' sx={{ mt: 2, fontStyle: 'italic', display: 'block' }}>
					Bestaande aanvragen die al op <strong>Koud</strong> staan worden niet automatisch herstart als je
					dit maximum verhoogt. Zet de status terug op <strong>Beantwoord</strong> om opnieuw herinneringen te
					krijgen binnen je nieuwe limiet.
				</BodySmall>
			</Box>

			<Box>
				<Overline color='text.secondary' sx={{ display: 'block', mb: 2 }}>
					Automatisch koud markeren
				</Overline>
				<BodySmall color='text.secondary' sx={{ mb: 3 }}>
					Na deze stilteperiode (zonder klantreactie en met alle herinneringen verstuurd) zet Offertum de
					offerteaanvraag automatisch op <strong>Koud</strong>. Zet op <strong>0</strong> om dit uit te zetten
					je houdt opportunities dan zelf bij.
				</BodySmall>
				<Stack direction='row' useFlexGap spacing={2} sx={{ alignItems: 'center' }}>
					<Box sx={{ width: 120 }}>
						<Field name='coldAfterDays' type='number' fullWidth />
					</Box>
					<BodySmall color='text.secondary'>
						{coldAfterDays === 1 ? 'dag' : 'dagen'} na laatste verzending
					</BodySmall>
				</Stack>
				{coldAfterDays === 0 && (
					<BodySmall color='text.disabled' sx={{ mt: 2, fontStyle: 'italic', display: 'block' }}>
						Automatisch koud markeren staat uit.
					</BodySmall>
				)}
			</Box>

			{schedulerDisabled && (
				<Banner tone='warning'>
					De scheduler staat uit. Offertum maakt geen automatische herinneringen tot je dit weer aanzet.
				</Banner>
			)}

			{!schedulerDisabled && (
				<Box sx={{ p: 4, bgcolor: 'background.default', borderRadius: 1, border: 1, borderColor: 'divider' }}>
					<BodySmall color='text.secondary' sx={{ lineHeight: 1.5, display: 'block' }}>
						<Box component='span' sx={{ color: 'text.primary', fontWeight: 'medium' }}>
							Voorbeeld:
						</Box>{' '}
						je verstuurt vandaag een offerte. Reageert de klant niet, dan zet Offertum over {cadenceDays}{' '}
						dagen een eerste herinnering klaar
						{maxCount > 1 ? `, en na nog ${cadenceDays} dagen een tweede` : ''}
						{maxCount > 2 ? `, tot maximaal ${maxCount} herinneringen` : ''}. De herinneringen staan in je
						inbox; jij beoordeelt en verstuurt.
					</BodySmall>
				</Box>
			)}

			{error && <Banner tone='error'>{error instanceof Error ? error.message : 'Opslaan mislukt.'}</Banner>}
			{savedFlash && <Banner tone='success'>Opgeslagen.</Banner>}

			<Stack direction='row' useFlexGap spacing={2} sx={{ justifyContent: 'flex-end' }}>
				<Button type='submit' variant='contained' disabled={isSaving}>
					{isSaving ? 'Opslaan…' : 'Opslaan'}
				</Button>
			</Stack>
		</Stack>
	);
}

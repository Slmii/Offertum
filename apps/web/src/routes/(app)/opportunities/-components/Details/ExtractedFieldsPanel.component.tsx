import { AppIcon, type AppIconName } from '@/components/AppIcon.component';
import { StandaloneDatePicker } from '@/components/Form/DatePicker/DatePicker.component';
import { StandaloneDateTimePicker } from '@/components/Form/DateTimePicker/DateTimePicker.component';
import { StandaloneField } from '@/components/Form/Field/Field.component';
import { StandaloneSelect } from '@/components/Form/Select/Select.component';
import { Overline } from '@/components/Text.component';
import { useToast } from '@/lib/hooks/use-toast';
import { useUpdateOpportunityFields } from '@/lib/queries/opportunities.queries';
import { OPPORTUNITY_URGENCY_LABELS_NL } from '@/lib/utils/opportunity.utils';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import InputLabel from '@mui/material/InputLabel';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import { OPPORTUNITY_URGENCIES, type OpportunityUrgency } from '@offertum/shared';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useState, type ReactNode } from 'react';

/**
 * Right-rail "Aanvraaggegevens" panel showing the AI-extracted opportunity fields. Address /
 * urgency / deadline / appointment are inline-editable because the extractor isn't always right
 * and there's no other correction path; edits commit on blur (text), change (select), or accept
 * (date). No editability lock — even on WON/LOST opps the owner may need to correct a field.
 * Mutation failures surface as a toast (no inline banner). The "Afspraak" field uses a plain
 * date+time picker for now — picking from real agenda availability lands later (the
 * `AvailabilityPicker` component stays for that). Assignment lives in its own `AssigneePicker`.
 */
export function ExtractedFieldsPanel({
	opportunityId,
	opportunity,
	disabled = false
}: {
	opportunityId: string;
	disabled?: boolean;
	opportunity: {
		customerName: string | null;
		customerEmail: string | null;
		address: string | null;
		requestType: string;
		urgency: OpportunityUrgency;
		customerDeadline: string | null;
		customerAppointment: string | null;
		deliverableHints: string[];
		assignedToUserId: string | null;
	};
}) {
	const updateFields = useUpdateOpportunityFields(opportunityId);
	const toast = useToast();

	const onFieldError = (err: unknown) =>
		toast.error('Bijwerken mislukt', err instanceof Error ? err.message : 'Probeer het opnieuw.');

	// Local mirror for the address field. Re-sync from server on prop change so
	// regenerate / mutation success picks up the canonical value. Commits on blur.
	const [address, setAddress] = useState<string>(opportunity.address ?? '');

	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect
		setAddress(opportunity.address ?? '');
	}, [opportunity.address]);

	const commitAddress = () => {
		const next = address.trim() || null;
		if (next === (opportunity.address ?? null)) {
			return;
		}
		updateFields.mutate({ address: next }, { onError: onFieldError });
	};

	// Deadlines are date-only ("klant wil voor X klaar"). Appointments include a time
	// component ("donderdag 10:00") so we send the full ISO datetime — server stores as
	// DateTime either way, the service-layer no-op check handles same-value writes.
	const commitDeadline = (next: Dayjs | null) => {
		const iso = next && next.isValid() ? next.format('YYYY-MM-DD') : null;
		const currentIso = opportunity.customerDeadline ? opportunity.customerDeadline.slice(0, 10) : null;
		if (iso === currentIso) {
			return;
		}
		updateFields.mutate({ customerDeadline: iso }, { onError: onFieldError });
	};

	const commitAppointment = (next: Dayjs | null) => {
		const iso = next && next.isValid() ? next.toISOString() : null;
		const currentIso = opportunity.customerAppointment ?? null;
		if (iso === currentIso) {
			// Picker can fire onAccept with the unchanged value (e.g. user opened the
			// picker, didn't change anything, dismissed it). Skip the no-op write so the
			// audit log stays clean.
			return;
		}
		updateFields.mutate({ customerAppointment: iso }, { onError: onFieldError });
	};

	const commitUrgency = (next: OpportunityUrgency) => {
		if (next === opportunity.urgency) {
			return;
		}
		updateFields.mutate({ urgency: next }, { onError: onFieldError });
	};

	return (
		<Paper variant='outlined' sx={{ p: 2.25 }}>
			<Overline component='div' sx={{ mb: 2 }}>
				Aanvraaggegevens
			</Overline>
			<Stack useFlexGap spacing={1.75}>
				<RailField label='Adres' icon='map-pin'>
					<StandaloneField
						name='address'
						value={address}
						onChange={e => setAddress(e.target.value)}
						onBlur={commitAddress}
						placeholder='Geen adres gevonden'
						fullWidth
						multiline
						minRows={4}
						maxRows={8}
						maxLength={500}
						disabled={disabled}
					/>
				</RailField>
				<RailField label='Urgentie' icon='alert-triangle'>
					<StandaloneSelect
						name='urgency'
						value={opportunity.urgency}
						fullWidth
						size='small'
						disabled={disabled}
						options={OPPORTUNITY_URGENCIES.map(u => ({
							id: u,
							label: OPPORTUNITY_URGENCY_LABELS_NL[u]
						}))}
						onChange={e => commitUrgency(e.target.value as OpportunityUrgency)}
					/>
				</RailField>
				<RailField label='Deadline' icon='calendar'>
					<StandaloneDatePicker
						name='deadline'
						value={opportunity.customerDeadline ? dayjs(opportunity.customerDeadline) : null}
						fullWidth
						size='small'
						disabled={disabled}
						onAccept={commitDeadline}
						minDate={dayjs()}
					/>
				</RailField>
				<RailField label='Afspraak' icon='clock'>
					<StandaloneDateTimePicker
						name='appointment'
						value={opportunity.customerAppointment ? dayjs(opportunity.customerAppointment) : null}
						fullWidth
						size='small'
						disabled={disabled}
						onAccept={commitAppointment}
						minDate={dayjs()}
					/>
				</RailField>
				{opportunity.deliverableHints.length > 0 && (
					<RailField label='Onderdelen' icon='package'>
						<Stack direction='row' useFlexGap spacing={0.5} sx={{ flexWrap: 'wrap' }}>
							{opportunity.deliverableHints.map(hint => (
								<Chip key={hint} size='small' label={hint} />
							))}
						</Stack>
					</RailField>
				)}
			</Stack>
		</Paper>
	);
}

function RailField({ label, icon, children }: { label: string; icon: AppIconName; children: ReactNode }) {
	return (
		<Box>
			<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
				<Box component='span' sx={{ display: 'inline-flex', color: 'text.secondary' }}>
					<AppIcon name={icon} size='small' />
				</Box>
				<InputLabel sx={{ mb: 0 }}>{label}</InputLabel>
			</Box>
			{children}
		</Box>
	);
}

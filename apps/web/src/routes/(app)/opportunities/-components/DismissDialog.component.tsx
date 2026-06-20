import { Banner } from '@/components/Banner.component';
import { Field } from '@/components/Form/Field/Field.component';
import { Form } from '@/components/Form/Form.component';
import { RadioGroup as FormRadioGroup } from '@/components/Form/Radio/Radio.component';
import { BodySmall } from '@/components/Text.component';
import { useDismissOpportunity } from '@/lib/queries/opportunities.queries';
import { DismissOpportunitySchema, type DismissOpportunityForm } from '@/lib/schemas/dismiss-opportunity.schema';
import { OPPORTUNITY_DISMISS_REASON_LABELS_NL } from '@/lib/utils/opportunity.utils';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import { OPPORTUNITY_DISMISS_REASONS } from '@offertum/shared';

const DISMISS_FORM_ID = 'dismiss-opportunity-form';

/**
 * Modal for dismissing an opportunity as "not a quote request". Captures a reason (drives the
 * classifier-precision feedback loop) + optional notes. Warns when a reply was already sent —
 * dismissing is internal-only and doesn't unsend the email.
 */
export function DismissDialog({
	opportunityId,
	replyDraftSentAt,
	onClose
}: {
	opportunityId: string;
	replyDraftSentAt: string | null;
	onClose: () => void;
}) {
	const dismiss = useDismissOpportunity();

	const onSubmit = (values: DismissOpportunityForm) => {
		dismiss.mutate(
			{ id: opportunityId, reason: values.reason, notes: values.notes },
			{ onSuccess: () => onClose() }
		);
	};

	const hasSentReply = replyDraftSentAt !== null;

	// The form lives inside DialogContent; the submit button lives in DialogActions
	// (outside that `<form>` element because DialogActions is a sibling Box). HTML's
	// `form=<id>` attribute on the button links them across the DOM gap.
	return (
		<Dialog open onClose={dismiss.isPending ? undefined : onClose} maxWidth='xs' fullWidth>
			<DialogTitle>Waarom afwijzen?</DialogTitle>
			<DialogContent>
				{hasSentReply && (
					<Banner tone='warning' sx={{ mb: 2 }}>
						Je hebt al een antwoord verstuurd, maar afwijzen markeert deze offerteaanvraag alleen intern als
						geen offerte. Het verzonden e-mailbericht blijft staan.
					</Banner>
				)}
				<BodySmall color='text.secondary' sx={{ mb: 2 }}>
					Je feedback helpt onze AI om in de toekomst beter te herkennen wat wél en geen offerteaanvraag is.
				</BodySmall>
				<Form<DismissOpportunityForm>
					id={DISMISS_FORM_ID}
					action={onSubmit}
					schema={DismissOpportunitySchema}
					defaultValues={{ reason: 'not_a_quote', notes: '' }}
				>
					<FormRadioGroup
						name='reason'
						label='Reden'
						options={OPPORTUNITY_DISMISS_REASONS.map(r => ({
							value: r,
							label: OPPORTUNITY_DISMISS_REASON_LABELS_NL[r]
						}))}
					/>
					<Field
						name='notes'
						label='Toelichting (optioneel)'
						multiline
						fullWidth
						maxLength={500}
						size='small'
					/>
					{dismiss.isError && (
						<Banner tone='error'>
							{dismiss.error instanceof Error ? dismiss.error.message : 'Afwijzen mislukt'}
						</Banner>
					)}
				</Form>
			</DialogContent>
			<DialogActions>
				<Button onClick={onClose} disabled={dismiss.isPending}>
					Annuleren
				</Button>
				<Button
					type='submit'
					form={DISMISS_FORM_ID}
					variant='contained'
					disabled={dismiss.isPending}
					startIcon={dismiss.isPending ? <CircularProgress size={14} /> : null}
				>
					Afwijzen
				</Button>
			</DialogActions>
		</Dialog>
	);
}

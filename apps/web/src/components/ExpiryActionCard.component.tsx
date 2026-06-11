import {
	opportunityExpiryActionQueryOptions,
	useDismissExpiryAction,
	useTakeExpiryAction
} from '@/lib/queries/expiry.queries';
import { toReadableDate } from '@/lib/utils/date.utils';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { EXPIRY_ACTION_KINDS, type ExpiryActionKindValue } from '@offertum/shared';
import { useSuspenseQuery } from '@tanstack/react-query';

const EXPIRY_ACTION_LABELS_NL: Record<ExpiryActionKindValue, string> = {
	EXTEND_14D: 'Verleng 14 dagen',
	LAST_FOLLOWUP: 'Laatste herinnering',
	MARK_LOST: 'Markeer verloren'
};

/**
 * Smart-expiry suggestion card (W13). Surfaced near the top of the opportunity detail view
 * when the watcher has produced a live SUGGESTED action for a soon-to-expire quote. The
 * expiry date is rendered as an absolute date via `toReadableDate` — we deliberately do NOT
 * compute "over N dagen" from `new Date()` in render, which would hydration-mismatch under
 * SSR. The recommended action's button is `contained`; the other two are `outlined`.
 */
export function ExpiryActionCard({ opportunityId }: { opportunityId: string }) {
	const { data: expiryAction } = useSuspenseQuery(opportunityExpiryActionQueryOptions(opportunityId));
	const takeAction = useTakeExpiryAction(opportunityId);
	const dismiss = useDismissExpiryAction(opportunityId);

	if (!expiryAction) {
		return null;
	}

	const isPending = takeAction.isPending || dismiss.isPending;

	return (
		<Alert
			severity='warning'
			sx={{ mb: 3 }}
			action={
				<Button
					color='inherit'
					size='small'
					onClick={() => dismiss.mutate({ id: expiryAction.id })}
					disabled={isPending}
				>
					Negeren
				</Button>
			}
		>
			<AlertTitle>Verloopt op {toReadableDate(expiryAction.validUntil)}</AlertTitle>
			<Typography variant='body2' sx={{ mb: 1.5 }}>
				{expiryAction.suggestedCopy}
			</Typography>
			<Stack direction='row' useFlexGap spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
				{EXPIRY_ACTION_KINDS.map(kind => {
					const isRecommended = kind === expiryAction.recommendedAction;
					return (
						<Button
							key={kind}
							size='small'
							color='inherit'
							variant={isRecommended ? 'contained' : 'outlined'}
							onClick={() => takeAction.mutate({ id: expiryAction.id, kind })}
							disabled={isPending}
							startIcon={
								takeAction.isPending && takeAction.variables?.kind === kind ? (
									<CircularProgress size={14} />
								) : null
							}
						>
							{EXPIRY_ACTION_LABELS_NL[kind]}
						</Button>
					);
				})}
			</Stack>
		</Alert>
	);
}

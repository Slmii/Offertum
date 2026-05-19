import { BackToHomeButton } from '@/components/BackToHomeButton.component';
import { SummaryCard } from '@/components/SummaryCard.component';
import { classifierQualityQueryOptions } from '@/lib/queries/classifier-quality.queries';
import { toReadableDateTime } from '@/lib/utils/date.utils';
import { toReadableNumber, toReadablePercent } from '@/lib/utils/number.utils';
import { OPPORTUNITY_DISMISS_REASON_LABELS_NL } from '@/lib/utils/opportunity.utils';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import type {
	AIUsageRange,
	ClassifierDismissedRow,
	ClassifierPrecisionRow,
	DismissReasonCounts,
	OpportunityDismissReason
} from '@quoteom/shared';
import { OPPORTUNITY_DISMISS_REASONS } from '@quoteom/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';

const SearchSchema = z.object({
	range: z.enum(['today', '7d', '30d', 'all']).default('7d')
});

// Admin allowlist gate lives on the parent `(app)/admin/route.tsx` layout — every
// `/admin/*` route inherits it, so this route only owns its own data loading.
export const Route = createFileRoute('/(app)/admin/classifier-quality')({
	validateSearch: SearchSchema,
	loaderDeps: ({ search: { range } }) => ({ range }),
	loader: ({ context, deps }) => context.queryClient.ensureQueryData(classifierQualityQueryOptions(deps.range)),
	component: ClassifierQualityPage
});

const RANGE_LABELS: Record<AIUsageRange, string> = {
	today: 'Today',
	'7d': 'Last 7 days',
	'30d': 'Last 30 days',
	all: 'All time'
};

function ClassifierQualityPage() {
	const navigate = useNavigate();
	const { range } = Route.useSearch();
	const { data } = useSuspenseQuery(classifierQualityQueryOptions(range));

	const setRange = (next: AIUsageRange) => {
		void navigate({ to: '/admin/classifier-quality', search: { range: next } });
	};

	return (
		<Container maxWidth='lg' sx={{ py: 6 }}>
			<Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
				<Typography variant='h1' sx={{ fontSize: 28 }}>
					Classifier quality
				</Typography>
				<Chip label='dev only' size='small' color='warning' />
				<Box sx={{ flex: 1 }} />
				<BackToHomeButton />
			</Box>
			<Typography variant='body2' color='text.secondary' sx={{ mb: 3 }}>
				Precision = <code>1 − (any dismissal / total opportunities)</code>. Every dismiss reason counts — from
				the owner's perspective the system was wrong regardless of which subsystem failed. The reason chips
				below + bulk-mail recall card diagnose <em>which</em> subsystem (classifier, bulk-mail filter, dedup) is
				to blame.
			</Typography>

			<ButtonGroup variant='outlined' size='small' sx={{ mb: 3 }}>
				{(Object.keys(RANGE_LABELS) as AIUsageRange[]).map(option => (
					<Button
						key={option}
						variant={option === range ? 'contained' : 'outlined'}
						onClick={() => setRange(option)}
					>
						{RANGE_LABELS[option]}
					</Button>
				))}
			</ButtonGroup>

			<Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
				<SummaryCard label='Overall precision' value={toReadablePercent(data.summary.overallPrecision)} />
				<SummaryCard label='Opportunities' value={toReadableNumber(data.summary.totalOpportunities)} />
				<SummaryCard label='Dismissed (total)' value={toReadableNumber(data.summary.totalDismissed)} />
				<SummaryCard label='Bulk-mail recall' value={toReadablePercent(data.bulkMailFilter.recall)} />
			</Stack>

			<DismissReasonBreakdown counts={data.summary.totalDismissedByReason} />

			<BulkMailFilterPanel recall={data.bulkMailFilter} />

			<Typography variant='h2' sx={{ fontSize: 18, mt: 4, mb: 1 }}>
				Precision by org · classifier model
			</Typography>
			<PrecisionTable rows={data.precision} />

			<Typography variant='h2' sx={{ fontSize: 18, mt: 4, mb: 1 }}>
				Recent dismissals (last 5)
			</Typography>
			<Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
				Most-recent dismissed opportunities in the selected window, any reason. Use{' '}
				<code>classifiedAiCallId</code> to look up the exact prompt + response that produced the call.
			</Typography>
			<RecentDismissalsTable rows={data.recentDismissals} />

			<Typography variant='caption' color='text.secondary' sx={{ display: 'block', mt: 2 }}>
				Window: {toReadableDateTime(data.rangeStart)} — {toReadableDateTime(data.rangeEnd)}
			</Typography>
		</Container>
	);
}

function DismissReasonBreakdown({ counts }: { counts: DismissReasonCounts }) {
	const total = counts.not_a_quote + counts.duplicate + counts.spam + counts.other;

	if (total === 0) {
		return (
			<Box sx={{ mb: 3 }}>
				<Typography variant='caption' color='text.secondary'>
					No dismissals in this window yet.
				</Typography>
			</Box>
		);
	}

	return (
		<Stack direction='row' spacing={1} sx={{ mb: 3, flexWrap: 'wrap', alignItems: 'center' }}>
			<Typography variant='caption' color='text.secondary' sx={{ mr: 1 }}>
				By reason:
			</Typography>
			{OPPORTUNITY_DISMISS_REASONS.map(reason => (
				<Chip
					key={reason}
					size='small'
					label={`${OPPORTUNITY_DISMISS_REASON_LABELS_NL[reason]}: ${toReadableNumber(counts[reason])}`}
					color={counts[reason] > 0 ? 'default' : 'default'}
					variant={counts[reason] > 0 ? 'filled' : 'outlined'}
				/>
			))}
		</Stack>
	);
}

function BulkMailFilterPanel({
	recall
}: {
	recall: { caughtCount: number; missedCount: number; recall: number | null };
}) {
	if (recall.caughtCount === 0 && recall.missedCount === 0) {
		return (
			<Alert severity='info' sx={{ mb: 3 }}>
				No bulk-mail activity in this window — the filter hasn't fired and no opportunities were dismissed as
				SPAM yet. Numbers will populate once mail starts flowing.
			</Alert>
		);
	}

	const severity = recall.recall !== null && recall.recall < 0.9 ? 'warning' : 'info';

	return (
		<Alert severity={severity} sx={{ mb: 3 }}>
			Bulk-mail filter caught <strong>{toReadableNumber(recall.caughtCount)}</strong> marketing emails before the
			classifier ran. Users dismissed <strong>{toReadableNumber(recall.missedCount)}</strong> opportunities as
			SPAM (the filter missed those). Recall = <strong>{toReadablePercent(recall.recall)}</strong>. Low recall =
			the filter's signals (List-Unsubscribe header, tracking-domain count, unsubscribe phrases) need tightening —
			promote the missed bodies to the filter's fixture corpus via the W4.6.6 export CLI.
		</Alert>
	);
}

function PrecisionTable({ rows }: { rows: readonly ClassifierPrecisionRow[] }) {
	return (
		<TableContainer component={Paper} variant='outlined'>
			<Table size='small'>
				<TableHead>
					<TableRow>
						<TableCell>Org</TableCell>
						<TableCell>Provider</TableCell>
						<TableCell>Model</TableCell>
						<TableCell align='right'>Opportunities</TableCell>
						<TableCell align='right'>Dismissed</TableCell>
						<TableCell>Reason breakdown</TableCell>
						<TableCell align='right'>Precision</TableCell>
					</TableRow>
				</TableHead>
				<TableBody>
					{rows.length === 0 ? (
						<TableRow>
							<TableCell colSpan={7} align='center' sx={{ py: 6, color: 'text.secondary' }}>
								No opportunities in this range.
							</TableCell>
						</TableRow>
					) : (
						rows.map(row => (
							<TableRow
								key={`${row.organizationId}/${row.provider}/${row.model}`}
								sx={{ backgroundColor: row.precision < 0.9 ? '#FAF3E8' : undefined }}
							>
								<TableCell>
									<code style={{ fontSize: '0.7rem' }}>{row.organizationId.slice(0, 8)}</code>
								</TableCell>
								<TableCell>{row.provider}</TableCell>
								<TableCell>
									<code>{row.model}</code>
								</TableCell>
								<TableCell align='right'>{toReadableNumber(row.totalOpportunities)}</TableCell>
								<TableCell align='right'>{toReadableNumber(row.dismissedCount)}</TableCell>
								<TableCell>
									<ReasonChipsCompact counts={row.dismissedByReason} />
								</TableCell>
								<TableCell align='right'>
									<strong>{toReadablePercent(row.precision)}</strong>
								</TableCell>
							</TableRow>
						))
					)}
				</TableBody>
			</Table>
		</TableContainer>
	);
}

function ReasonChipsCompact({ counts }: { counts: DismissReasonCounts }) {
	const visible = OPPORTUNITY_DISMISS_REASONS.filter(r => counts[r] > 0);
	if (visible.length === 0) {
		return (
			<Typography variant='caption' color='text.secondary'>
				—
			</Typography>
		);
	}
	return (
		<Stack direction='row' spacing={0.5} sx={{ flexWrap: 'wrap' }}>
			{visible.map(reason => (
				<Chip
					key={reason}
					size='small'
					label={`${OPPORTUNITY_DISMISS_REASON_LABELS_NL[reason]}: ${counts[reason]}`}
					sx={{ fontSize: '0.65rem', height: 18 }}
				/>
			))}
		</Stack>
	);
}

function RecentDismissalsTable({ rows }: { rows: readonly ClassifierDismissedRow[] }) {
	return (
		<TableContainer component={Paper} variant='outlined'>
			<Table size='small'>
				<TableHead>
					<TableRow>
						<TableCell>Dismissed</TableCell>
						<TableCell>Reason</TableCell>
						<TableCell>Subject / from</TableCell>
						<TableCell>Customer / request type</TableCell>
						<TableCell>Classifier model</TableCell>
						<TableCell align='right'>Confidence</TableCell>
						<TableCell>AI Call ID</TableCell>
					</TableRow>
				</TableHead>
				<TableBody>
					{rows.length === 0 ? (
						<TableRow>
							<TableCell colSpan={7} align='center' sx={{ py: 6, color: 'text.secondary' }}>
								No dismissals in this range.
							</TableCell>
						</TableRow>
					) : (
						rows.map(row => (
							<TableRow key={row.opportunityId}>
								<TableCell sx={{ whiteSpace: 'nowrap' }}>
									{toReadableDateTime(row.dismissedAt)}
								</TableCell>
								<TableCell>
									<Chip
										size='small'
										label={OPPORTUNITY_DISMISS_REASON_LABELS_NL[row.dismissReason]}
										color={dismissReasonChipColor(row.dismissReason)}
										variant='outlined'
									/>
								</TableCell>
								<TableCell>
									<Typography variant='body2' sx={{ fontWeight: 500 }}>
										{row.subject ?? '(no subject)'}
									</Typography>
									<Typography variant='caption' color='text.secondary'>
										{row.fromEmail ?? '—'}
									</Typography>
								</TableCell>
								<TableCell>
									<Typography variant='body2'>{row.customerName ?? '(none)'}</Typography>
									<Typography variant='caption' color='text.secondary'>
										{row.requestType}
									</Typography>
								</TableCell>
								<TableCell>
									{row.classifierProvider && row.classifierModel ? (
										<code style={{ fontSize: '0.7rem' }}>
											{row.classifierProvider}/{row.classifierModel}
										</code>
									) : (
										'—'
									)}
								</TableCell>
								<TableCell align='right'>
									{row.classifierConfidence !== null
										? toReadablePercent(row.classifierConfidence)
										: '—'}
								</TableCell>
								<TableCell>
									{row.classifiedAiCallId ? (
										<code style={{ fontSize: '0.7rem' }}>{row.classifiedAiCallId.slice(0, 8)}</code>
									) : (
										'—'
									)}
								</TableCell>
							</TableRow>
						))
					)}
				</TableBody>
			</Table>
		</TableContainer>
	);
}

function dismissReasonChipColor(reason: OpportunityDismissReason): 'error' | 'warning' | 'info' | 'default' {
	switch (reason) {
		case 'not_a_quote':
			return 'error';
		case 'spam':
			return 'warning';
		case 'duplicate':
			return 'info';
		case 'other':
		default:
			return 'default';
	}
}

import { Banner } from '@/components/Banner.component';
import { PageHeader } from '@/components/PageHeader.component';
import { SectionError } from '@/components/SectionError.component';
import { SummaryCard } from '@/components/SummaryCard.component';
import { BodySmall, H3 } from '@/components/Text.component';
import { classifierQualityQueryOptions } from '@/lib/queries/classifier-quality.queries';
import { toReadableDateTime } from '@/lib/utils/date.utils';
import { toReadableNumber, toReadablePercent } from '@/lib/utils/number.utils';
import { OPPORTUNITY_DISMISS_REASON_LABELS_NL } from '@/lib/utils/opportunity.utils';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import type {
	AIUsageRange,
	ClassifierDismissedRow,
	ClassifierPrecisionRow,
	DismissReasonCounts,
	OpportunityDismissReason
} from '@offertum/shared';
import { OPPORTUNITY_DISMISS_REASONS } from '@offertum/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
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
	component: ClassifierQualityPage,
	errorComponent: SectionError
});

const RANGE_LABELS: Record<AIUsageRange, string> = {
	today: 'Today',
	'7d': 'Last 7 days',
	'30d': 'Last 30 days',
	all: 'All time'
};

function ClassifierQualityPage() {
	const { range } = Route.useSearch();
	const { data } = useSuspenseQuery(classifierQualityQueryOptions(range));

	return (
		<Stack>
			<PageHeader
				title='Classifier quality'
				caption={
					<>
						Precision = <code>1 − (any dismissal / total opportunities)</code>. Every dismiss reason counts
						(from the owner's perspective the system was wrong regardless of which subsystem failed). The
						reason chips below + bulk-mail recall card diagnose <em>which</em> subsystem (classifier,
						bulk-mail filter, dedup) is to blame.
					</>
				}
			/>

			<Stack direction='row' useFlexGap spacing={1} sx={{ mb: 3 }}>
				{(Object.keys(RANGE_LABELS) as AIUsageRange[]).map(option => (
					<Link
						key={option}
						to='/admin/classifier-quality'
						search={{ range: option }}
						style={{ textDecoration: 'none' }}
					>
						<Button size='small' variant={option === range ? 'contained' : 'outlined'}>
							{RANGE_LABELS[option]}
						</Button>
					</Link>
				))}
			</Stack>

			<Stack direction={{ xs: 'column', md: 'row' }} useFlexGap spacing={2} sx={{ mb: 2 }}>
				<SummaryCard label='Overall precision' value={toReadablePercent(data.summary.overallPrecision)} />
				<SummaryCard label='Opportunities' value={toReadableNumber(data.summary.totalOpportunities)} />
				<SummaryCard label='Dismissed (total)' value={toReadableNumber(data.summary.totalDismissed)} />
				<SummaryCard label='Bulk-mail recall' value={toReadablePercent(data.bulkMailFilter.recall)} />
			</Stack>

			<DismissReasonBreakdown counts={data.summary.totalDismissedByReason} />

			<BulkMailFilterPanel recall={data.bulkMailFilter} />

			<H3 sx={{ mt: 4, mb: 1 }}>Precision by org · classifier model</H3>
			<PrecisionTable rows={data.precision} />

			<H3 sx={{ mt: 4, mb: 1 }}>Recent dismissals (last 5)</H3>
			<BodySmall color='textSecondary' sx={{ display: 'block', mb: 2 }}>
				Most-recent dismissed opportunities in the selected window, any reason. Use{' '}
				<code>classifiedAiCallId</code> to look up the exact prompt + response that produced the call.
			</BodySmall>
			<RecentDismissalsTable rows={data.recentDismissals} />

			<BodySmall color='textSecondary' sx={{ display: 'block', mt: 2 }}>
				Window: {toReadableDateTime(data.rangeStart)} to {toReadableDateTime(data.rangeEnd)}
			</BodySmall>
		</Stack>
	);
}

function DismissReasonBreakdown({ counts }: { counts: DismissReasonCounts }) {
	const total = counts.not_a_quote + counts.duplicate + counts.spam + counts.other;

	if (total === 0) {
		return (
			<Box sx={{ mb: 3 }}>
				<BodySmall color='textSecondary'>No dismissals in this window yet.</BodySmall>
			</Box>
		);
	}

	return (
		<Stack direction='row' useFlexGap spacing={1} sx={{ mb: 3, flexWrap: 'wrap', alignItems: 'center' }}>
			<BodySmall color='textSecondary' sx={{ mr: 1 }}>
				By reason:
			</BodySmall>
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
			<Banner tone='info' sx={{ mb: 3 }}>
				No bulk-mail activity in this window: the filter hasn't fired and no opportunities were dismissed as
				SPAM yet. Numbers will populate once mail starts flowing.
			</Banner>
		);
	}

	const severity = recall.recall !== null && recall.recall < 0.9 ? 'warning' : 'info';

	return (
		<Banner tone={severity} sx={{ mb: 3 }}>
			Bulk-mail filter caught <strong>{toReadableNumber(recall.caughtCount)}</strong> marketing emails before the
			classifier ran. Users dismissed <strong>{toReadableNumber(recall.missedCount)}</strong> opportunities as
			SPAM (the filter missed those). Recall = <strong>{toReadablePercent(recall.recall)}</strong>. Low recall
			means the filter's signals (List-Unsubscribe header, tracking-domain count, unsubscribe phrases) need
			tightening: promote the missed bodies to the filter's fixture corpus via the export CLI.
		</Banner>
	);
}

function PrecisionTable({ rows }: { rows: readonly ClassifierPrecisionRow[] }) {
	return (
		<TableContainer component={Paper} variant='outlined'>
			<Table>
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
							<TableCell colSpan={7} align='center' sx={{ py: 6 }}>
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
									<code style={{ fontSize: '0.75rem' }}>{row.organizationId.slice(0, 8)}</code>
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
		return <BodySmall color='textSecondary'>(none)</BodySmall>;
	}
	return (
		<Stack direction='row' useFlexGap spacing={0.5} sx={{ flexWrap: 'wrap' }}>
			{visible.map(reason => (
				<Chip
					key={reason}
					size='small'
					label={`${OPPORTUNITY_DISMISS_REASON_LABELS_NL[reason]}: ${counts[reason]}`}
					sx={{ fontSize: 12, height: 20 }}
				/>
			))}
		</Stack>
	);
}

function RecentDismissalsTable({ rows }: { rows: readonly ClassifierDismissedRow[] }) {
	return (
		<TableContainer component={Paper} variant='outlined'>
			<Table>
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
							<TableCell colSpan={7} align='center' sx={{ py: 6 }}>
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
									<BodySmall fontWeight='medium'>{row.subject ?? '(no subject)'}</BodySmall>
									<BodySmall color='textSecondary'>{row.fromEmail ?? '—'}</BodySmall>
								</TableCell>
								<TableCell>
									<BodySmall>{row.customerName ?? '(none)'}</BodySmall>
									<BodySmall color='textSecondary'>{row.requestType}</BodySmall>
								</TableCell>
								<TableCell>
									{row.classifierProvider && row.classifierModel ? (
										<code style={{ fontSize: '0.75rem' }}>
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
										<code style={{ fontSize: '0.75rem' }}>
											{row.classifiedAiCallId.slice(0, 8)}
										</code>
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

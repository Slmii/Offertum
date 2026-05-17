import { listOpportunitiesServer } from '@/lib/api/opportunities.api';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import {
	opportunitiesListQueryOptions,
	OpportunityKeys,
	useUpdateOpportunityStatus
} from '@/lib/queries/opportunities.queries';
import { toReadableDate, toReadableTimestamp } from '@/lib/utils/date.utils';
import {
	OPPORTUNITY_SORT_LABELS_NL,
	OPPORTUNITY_SORT_OPTIONS,
	OPPORTUNITY_STATUS_CHIP_COLORS,
	OPPORTUNITY_STATUS_LABELS_NL,
	OPPORTUNITY_URGENCY_COLORS,
	opportunityCustomerLabel,
	sortOpportunities,
	type OpportunitySortOption
} from '@/lib/utils/opportunity.utils';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { Opportunity, OpportunityStatus, OpportunityStatusCounts } from '@quoteom/shared';
import { OPPORTUNITY_STATUSES } from '@quoteom/shared';
import { useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { z } from 'zod';

const SearchSchema = z.object({
	status: z.enum(OPPORTUNITY_STATUSES).optional(),
	// `search` capped to 80 chars matches the API DTO; over-long input is truncated
	// at the form layer so a paste of an email body doesn't end up in the URL.
	search: z.string().trim().max(80).optional(),
	sort: z.enum(OPPORTUNITY_SORT_OPTIONS).optional()
});

export const Route = createFileRoute('/(app)/opportunities/')({
	validateSearch: SearchSchema,
	loaderDeps: ({ search: { status, search } }) => ({
		status: status ?? null,
		// Search is part of loaderDeps so a refresh-with-search-in-URL prefetches the
		// correct filtered first page on the server, not the unfiltered one.
		search: search?.trim() || null
	}),
	loader: ({ context, deps }) =>
		context.queryClient.ensureQueryData(opportunitiesListQueryOptions(deps.status, deps.search)),
	component: OpportunitiesIndexPage
});

function OpportunitiesIndexPage() {
	const navigate = useNavigate();
	const urlSearch = Route.useSearch();
	const activeStatus = urlSearch.status ?? null;
	const urlSearchTerm = urlSearch.search ?? '';
	const sort: OpportunitySortOption = urlSearch.sort ?? 'newest_first';

	// `searchInput` is local mirror of the URL `search` param — typing updates it
	// immediately (responsive UI), then the debounced effect below pushes the trimmed
	// value back to the URL so a refresh restores the term. Initializing from URL on
	// mount handles the refresh-with-search case; the post-mount sync handles the
	// browser-back / programmatic-navigate case.
	const [searchInput, setSearchInput] = useState(urlSearchTerm);
	const debouncedSearch = useDebouncedValue(searchInput.trim(), 250);

	useEffect(() => {
		// URL changed externally (back button, link click, programmatic navigate elsewhere)
		// → sync local input. Disable `set-state-in-effect`: this IS the URL→input mirror
		// the buffered-input pattern needs; typing is handled by the debounce-out-to-URL
		// effect below, so the loop is intentional and bounded.
		// eslint-disable-next-line react-hooks/set-state-in-effect
		setSearchInput(urlSearchTerm);
	}, [urlSearchTerm]);

	useEffect(() => {
		// Local input stabilised → reflect into URL. `replace: true` so the browser
		// history doesn't grow per keystroke. Skips when nothing changed to avoid a
		// pointless navigate roundtrip + cache invalidation cascade.
		if ((urlSearch.search ?? '') === debouncedSearch) {
			return;
		}
		void navigate({
			to: '/opportunities',
			search: { ...urlSearch, search: debouncedSearch || undefined },
			replace: true
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [debouncedSearch]);

	// Suspense-load the (status + URL-search) page so the route is SSR-safe and a
	// refresh-with-search-in-URL paints the right rows on first frame. Local-search-
	// typing fires a non-suspending `useQuery` (below) so the input keeps focus.
	const initial = useSuspenseQuery(opportunitiesListQueryOptions(activeStatus, urlSearchTerm || null));
	const typingSearch = debouncedSearch !== urlSearchTerm.trim() ? debouncedSearch : '';
	const searched = useQuery({
		...opportunitiesListQueryOptions(activeStatus, typingSearch),
		enabled: typingSearch.length > 0
	});
	const data = typingSearch.length > 0 ? (searched.data ?? initial.data) : initial.data;
	const searching = typingSearch.length > 0 && searched.isFetching;

	const visibleOpportunities = useMemo(() => sortOpportunities(data.opportunities, sort), [data.opportunities, sort]);

	return (
		<Container maxWidth='md' sx={{ py: 6 }}>
			<Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 1 }}>
				<Typography variant='h1' sx={{ fontSize: 28 }}>
					Offerteaanvragen
				</Typography>
				<Button size='small' variant='text' onClick={() => navigate({ to: '/' })}>
					← Home
				</Button>
			</Box>
			<Typography variant='body2' color='text.secondary' sx={{ mb: 3 }}>
				Inkomende offerteaanvragen uit je verbonden mailbox. Nieuwe e-mails verschijnen meestal binnen een paar
				seconden nadat ze binnenkomen.
			</Typography>

			<StatusFilterTabs
				active={activeStatus}
				counts={data.statusCounts}
				onChange={next =>
					navigate({
						to: '/opportunities',
						search: { ...urlSearch, status: next ?? undefined },
						replace: true
					})
				}
			/>

			<Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 2, mb: 2 }}>
				<TextField
					size='small'
					placeholder='Zoek op klant, adres of type…'
					value={searchInput}
					onChange={e => setSearchInput(e.target.value)}
					slotProps={{
						htmlInput: {
							maxLength: 80
						}
					}}
					sx={{ flex: 1 }}
					InputProps={{
						endAdornment: searching ? (
							<InputAdornment position='end'>
								<CircularProgress size={14} />
							</InputAdornment>
						) : null
					}}
				/>
				<Select
					size='small'
					value={sort}
					onChange={e =>
						navigate({
							to: '/opportunities',
							search: {
								...urlSearch,
								sort:
									e.target.value === 'newest_first'
										? undefined
										: (e.target.value as OpportunitySortOption)
							},
							replace: true
						})
					}
					sx={{ minWidth: 200 }}
				>
					{OPPORTUNITY_SORT_OPTIONS.map(option => (
						<MenuItem key={option} value={option}>
							{OPPORTUNITY_SORT_LABELS_NL[option]}
						</MenuItem>
					))}
				</Select>
			</Stack>

			<Stack spacing={1.5}>
				{visibleOpportunities.length === 0 ? (
					<EmptyState filtered={activeStatus !== null || debouncedSearch.length > 0} />
				) : (
					visibleOpportunities.map(o => <OpportunityRow key={o.id} opportunity={o} />)
				)}
			</Stack>

			{/* `Load more` only makes sense for the un-searched, default-sort list — narrowing
			    by search or non-default sort applies only to the already-loaded page. */}
			{data.nextCursor && debouncedSearch.length === 0 && sort === 'newest_first' && (
				<LoadMoreButton
					initialCursor={data.nextCursor}
					status={activeStatus}
					initialList={data.opportunities}
				/>
			)}
		</Container>
	);
}

function StatusFilterTabs({
	active,
	counts,
	onChange
}: {
	active: OpportunityStatus | null;
	counts: OpportunityStatusCounts;
	onChange: (next: OpportunityStatus | null) => void;
}) {
	const total = counts.new + counts.replied + counts.waiting + counts.cold + counts.won + counts.lost;

	return (
		<Tabs
			value={active ?? 'all'}
			onChange={(_, next) => onChange(next === 'all' ? null : (next as OpportunityStatus))}
			variant='scrollable'
			scrollButtons='auto'
			sx={{ borderBottom: '1px solid #E8E1D4', minHeight: 40 }}
		>
			<Tab value='all' label={`Alles · ${total}`} sx={{ minHeight: 40 }} />
			{OPPORTUNITY_STATUSES.map(s => (
				<Tab
					key={s}
					value={s}
					label={`${OPPORTUNITY_STATUS_LABELS_NL[s]} · ${counts[s]}`}
					sx={{ minHeight: 40 }}
				/>
			))}
		</Tabs>
	);
}

function OpportunityRow({ opportunity }: { opportunity: Opportunity }) {
	const urgency = opportunity.urgency;
	const status = opportunity.status;
	const chip = OPPORTUNITY_STATUS_CHIP_COLORS[status];
	const deadlineLabel = opportunity.customerDeadline
		? `Deadline ${toReadableDate(opportunity.customerDeadline)}`
		: null;
	const subtitle = [opportunity.address ?? null, deadlineLabel].filter(Boolean).join(' · ');
	const arrivedLabel = toReadableTimestamp(opportunity.internalDate);
	const customerLabel = opportunityCustomerLabel(opportunity);
	const updateStatus = useUpdateOpportunityStatus();

	return (
		<Paper variant='outlined' sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
			<Box
				sx={{
					width: 10,
					height: 10,
					borderRadius: '50%',
					backgroundColor: OPPORTUNITY_URGENCY_COLORS[urgency],
					flexShrink: 0
				}}
				aria-label={`Urgentie: ${urgency}`}
			/>
			<Box sx={{ flex: 1, minWidth: 0 }}>
				<Stack direction='row' spacing={1} sx={{ mb: 0.25, alignItems: 'center' }}>
					<Select
						size='small'
						value={status}
						onChange={e =>
							updateStatus.mutate({ id: opportunity.id, status: e.target.value as OpportunityStatus })
						}
						disabled={updateStatus.isPending}
						variant='standard'
						disableUnderline
						sx={{
							'& .MuiSelect-select': {
								backgroundColor: chip.bg,
								color: chip.fg,
								fontWeight: 500,
								fontSize: '0.7rem',
								padding: '2px 22px 2px 8px',
								borderRadius: '999px',
								minWidth: 0
							}
						}}
						renderValue={() => OPPORTUNITY_STATUS_LABELS_NL[status]}
					>
						{OPPORTUNITY_STATUSES.map(s => (
							<MenuItem key={s} value={s}>
								{OPPORTUNITY_STATUS_LABELS_NL[s]}
							</MenuItem>
						))}
					</Select>
					<Typography variant='body2' sx={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis' }}>
						{customerLabel} · {opportunity.requestType}
					</Typography>
				</Stack>
				{subtitle && (
					<Typography variant='caption' color='text.secondary' sx={{ display: 'block' }}>
						{subtitle}
					</Typography>
				)}
				{opportunity.subject && (
					<Typography
						variant='caption'
						sx={{
							display: 'block',
							color: 'text.disabled',
							overflow: 'hidden',
							textOverflow: 'ellipsis',
							whiteSpace: 'nowrap'
						}}
					>
						{opportunity.subject}
					</Typography>
				)}
			</Box>
			<Typography variant='caption' color='text.secondary' sx={{ flexShrink: 0 }}>
				{arrivedLabel}
			</Typography>
		</Paper>
	);
}

function EmptyState({ filtered }: { filtered: boolean }) {
	if (filtered) {
		return (
			<Paper variant='outlined' sx={{ p: 4, textAlign: 'center', borderStyle: 'dashed' }}>
				<Typography variant='body2' color='text.secondary'>
					Geen offerteaanvragen die hierop matchen.
				</Typography>
			</Paper>
		);
	}
	return (
		<Paper variant='outlined' sx={{ p: 4, textAlign: 'center', borderStyle: 'dashed' }}>
			<Typography variant='body1' sx={{ fontWeight: 500, mb: 1 }}>
				Nog geen offerteaanvragen.
			</Typography>
			<Typography variant='body2' color='text.secondary'>
				Zodra er een binnenkomt op je verbonden mailbox, zie je 'm hier — meestal binnen een paar seconden.
			</Typography>
		</Paper>
	);
}

/**
 * Cursor-based "Load more" — TanStack Query's `useInfiniteQuery` would be cleaner, but
 * it doesn't compose with `ensureQueryData` (loader-driven SSR) without rolling a custom
 * persister. For a button-driven append this manual approach is small, explicit, and
 * lets us hold the accumulated list in local state.
 */
function LoadMoreButton({
	initialCursor,
	status,
	initialList
}: {
	initialCursor: string;
	status: OpportunityStatus | null;
	initialList: Opportunity[];
}) {
	const queryClient = useQueryClient();
	const [cursor, setCursor] = useState<string | null>(initialCursor);
	const [extra, setExtra] = useState<Opportunity[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const onClick = async () => {
		if (!cursor) {
			return;
		}

		setLoading(true);
		setError(null);

		try {
			const next = await listOpportunitiesServer({ data: { cursor, status, limit: 25 } });
			const accumulated = [...initialList, ...extra, ...next.opportunities];
			setExtra(prev => [...prev, ...next.opportunities]);
			setCursor(next.nextCursor);
			// Mirror the appended rows into the React Query cache so a re-mount of the
			// route doesn't lose the user's "Load more" history. Only update the data —
			// nextCursor moves forward too so a re-render reflects the new pagination state.
			queryClient.setQueryData(OpportunityKeys.list(status, null), {
				opportunities: accumulated,
				nextCursor: next.nextCursor,
				statusCounts: next.statusCounts
			});
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Kon meer aanvragen niet laden');
		} finally {
			setLoading(false);
		}
	};

	if (!cursor) {
		return null;
	}

	return (
		<Box sx={{ textAlign: 'center', mt: 3 }}>
			{error && (
				<Alert severity='error' sx={{ mb: 2 }}>
					{error}
				</Alert>
			)}
			<Button
				variant='outlined'
				onClick={onClick}
				disabled={loading}
				startIcon={loading ? <CircularProgress size={14} /> : null}
			>
				{loading ? 'Laden…' : 'Meer laden'}
			</Button>
		</Box>
	);
}

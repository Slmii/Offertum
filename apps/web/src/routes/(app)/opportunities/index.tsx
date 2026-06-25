import { Banner } from '@/components/Banner.component';
import { FixedPageLayout } from '@/components/FixedPageLayout.component';
import { StandaloneField } from '@/components/Form/Field/Field.component';
import { StandaloneSwitch } from '@/components/Form/Switch/Switch.component';
import { InfiniteList } from '@/components/InfiniteList/InfiniteList.component';
import { PageHeader } from '@/components/PageHeader.component';
import { SectionError } from '@/components/SectionError.component';
import { UpsellTeaser } from '@/components/UpsellTeaser.component';
import { listOpportunitiesServer } from '@/lib/api/opportunities.api';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { billingStatusQueryOptions, isBillingEntitled } from '@/lib/queries/billing.queries';
import { opportunitiesListQueryOptions, type OpportunityListAttributes } from '@/lib/queries/opportunities.queries';
import { patternsQueryOptions } from '@/lib/queries/patterns.queries';
import { myMembershipQueryOptions } from '@/lib/queries/team.queries';
import { OPPORTUNITY_SORT_OPTIONS, sortOpportunities, type OpportunitySortOption } from '@/lib/utils/opportunity.utils';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import {
	OPPORTUNITY_ASSIGNEE_FILTERS,
	OPPORTUNITY_DEADLINE_FILTERS,
	OPPORTUNITY_MAILBOX_OWNERSHIP_FILTERS,
	OPPORTUNITY_STATUSES,
	OPPORTUNITY_URGENCIES
} from '@offertum/shared';
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import { EmptyState } from './-components/List/EmptyState.component';
import { FilterChipRow } from './-components/List/FilterChipRow.component';
import { OpportunitiesListSkeleton } from './-components/List/OpportunitiesListSkeleton.component';
import { OppInsights } from './-components/List/OppInsights.component';
import { OpportunityRow } from './-components/List/OpportunityRow.component';
import { pendingFollowUpsQueryOptions } from './-components/List/PendingFollowUpsBanner.component';
import { StatusFilterTabs } from './-components/List/StatusFilterTabs.component';

// Every field carries `.catch(undefined)` so a malformed/hand-edited URL param degrades
// to its default instead of throwing in `validateSearch` (which renders the error page).
const SearchSchema = z.object({
	status: z.enum(OPPORTUNITY_STATUSES).optional().catch(undefined),
	// `search` capped to 80 chars matches the API DTO; over-long input is truncated
	// at the form layer so a paste of an email body doesn't end up in the URL.
	search: z.string().trim().max(80).optional().catch(undefined),
	sort: z.enum(OPPORTUNITY_SORT_OPTIONS).optional().catch(undefined),
	// `showDismissed=true` flips the list into the dismissed-only view. Default
	// (undefined) shows the active list. Kept as a boolean toggle in the URL rather than
	// exposing the full `active | dismissed | all` enum because the UI only offers a
	// binary switch — the `all` mode is for admin tooling, not the owner inbox.
	showDismissed: z.boolean().optional().catch(undefined),
	// Mailbox-owner filter. `mine` shows only opps from inboxes the current user owns.
	// Default (omitted) = `all`.
	owner: z.enum(OPPORTUNITY_MAILBOX_OWNERSHIP_FILTERS).optional().catch(undefined),
	// Assignment filter. `me` shows opps assigned to the current user; `unassigned`
	// shows opps with no assignee. Default (omitted) = `all`.
	assignee: z.enum(OPPORTUNITY_ASSIGNEE_FILTERS).optional().catch(undefined),
	// Attribute filters. Booleans omitted when off; urgency/deadline omitted when "all".
	hasReplies: z.boolean().optional().catch(undefined),
	urgency: z.enum(OPPORTUNITY_URGENCIES).optional().catch(undefined),
	deadline: z.enum(OPPORTUNITY_DEADLINE_FILTERS).optional().catch(undefined),
	pendingFollowup: z.boolean().optional().catch(undefined),
	hasAppointment: z.boolean().optional().catch(undefined)
});

export const Route = createFileRoute('/(app)/opportunities/')({
	validateSearch: SearchSchema,
	loaderDeps: ({ search: { status, search, showDismissed, owner, assignee, ...rest } }) => ({
		status: status ?? null,
		// Search is part of loaderDeps so a refresh-with-search-in-URL prefetches the
		// correct filtered first page on the server, not the unfiltered one.
		search: search?.trim() || null,
		showDismissed: showDismissed ?? false,
		owner: owner ?? null,
		assignee: assignee ?? null,
		attributes: {
			hasReplies: rest.hasReplies ?? null,
			urgency: rest.urgency ?? null,
			deadline: rest.deadline ?? null,
			pendingFollowup: rest.pendingFollowup ?? null,
			hasAppointment: rest.hasAppointment ?? null
		}
	}),
	loader: ({ context, deps }) =>
		Promise.all([
			context.queryClient.ensureQueryData(
				opportunitiesListQueryOptions(
					deps.status,
					deps.search,
					deps.showDismissed ? 'dismissed' : 'active',
					deps.owner,
					deps.assignee,
					deps.attributes
				)
			),
			context.queryClient.ensureQueryData(billingStatusQueryOptions),
			context.queryClient.ensureQueryData(myMembershipQueryOptions),
			// Insights bar inputs — independent of the page's filters; prefetch so they don't waterfall.
			context.queryClient.ensureQueryData(pendingFollowUpsQueryOptions()),
			context.queryClient.ensureQueryData(patternsQueryOptions)
		]),
	component: OpportunitiesIndexPage,
	pendingComponent: OpportunitiesListSkeleton,
	errorComponent: SectionError
});

function OpportunitiesIndexPage() {
	const navigate = useNavigate();
	// Shared with `FixedPageLayout` (scroll container) + `InfiniteList` (virtualizes against it).
	const listScrollRef = useRef<HTMLDivElement>(null);
	const urlSearch = Route.useSearch();
	const activeStatus = urlSearch.status ?? null;
	const urlSearchTerm = urlSearch.search ?? '';
	const sort: OpportunitySortOption = urlSearch.sort ?? 'newest_first';
	const showDismissed = urlSearch.showDismissed ?? false;
	const dismissedFilter = showDismissed ? 'dismissed' : 'active';
	const ownerFilter = urlSearch.owner ?? null;
	const assigneeFilter = urlSearch.assignee ?? null;

	// Memoized so the identity is stable across renders (only changes when a value changes) —
	// `loadMore` and the query options depend on it.
	const attributes: OpportunityListAttributes = useMemo(
		() => ({
			hasReplies: urlSearch.hasReplies ?? null,
			urgency: urlSearch.urgency ?? null,
			deadline: urlSearch.deadline ?? null,
			pendingFollowup: urlSearch.pendingFollowup ?? null,
			hasAppointment: urlSearch.hasAppointment ?? null
		}),
		[
			urlSearch.hasReplies,
			urlSearch.urgency,
			urlSearch.deadline,
			urlSearch.pendingFollowup,
			urlSearch.hasAppointment
		]
	);

	// `searchInput` is local mirror of the URL `search` param — typing updates it
	// immediately (responsive UI), then the debounced effect below pushes the trimmed
	// value back to the URL so a refresh restores the term.
	const [searchInput, setSearchInput] = useState(urlSearchTerm);
	const debouncedSearch = useDebouncedValue(searchInput.trim(), 250);

	useEffect(() => {
		// URL changed externally (back button, link click, programmatic navigate) → sync
		// local input. This IS the URL→input mirror the buffered-input pattern needs.
		// eslint-disable-next-line react-hooks/set-state-in-effect
		setSearchInput(urlSearchTerm);
	}, [urlSearchTerm]);

	useEffect(() => {
		// Local input stabilised → reflect into URL. `replace: true` so history doesn't
		// grow per keystroke. Guard prevents spurious navigations when other URL params
		// (status, sort) change while the search term is already synced.
		if ((urlSearch.search ?? '') === debouncedSearch) {
			return;
		}
		void navigate({
			to: '/opportunities',
			search: { ...urlSearch, search: debouncedSearch || undefined },
			replace: true
		});
	}, [debouncedSearch, navigate, urlSearch]);

	const { data, isFetching } = useSuspenseQuery(
		opportunitiesListQueryOptions(
			activeStatus,
			urlSearchTerm || null,
			dismissedFilter,
			ownerFilter,
			assigneeFilter,
			attributes
		)
	);
	const { data: billing } = useSuspenseQuery(billingStatusQueryOptions);
	const { data: me } = useSuspenseQuery(myMembershipQueryOptions);
	const isEntitled = isBillingEntitled(billing.state);
	const isOwner = me.role === 'OWNER';
	const searching = isFetching || debouncedSearch !== urlSearchTerm.trim();

	const visibleOpportunities = useMemo(() => sortOpportunities(data.opportunities, sort), [data.opportunities, sort]);

	const queryClient = useQueryClient();
	const [isFetchingNextPage, setIsFetchingNextPage] = useState(false);
	const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

	// Cursor pagination only applies to the un-searched, default-sort list — narrowing by
	// search or a non-default sort operates on the already-loaded page only.
	const paginationEnabled = debouncedSearch.length === 0 && sort === 'newest_first';
	const hasNextPage = paginationEnabled && data.nextCursor !== null;

	const loadMore = useCallback(async () => {
		if (data.nextCursor === null || isFetchingNextPage) {
			return;
		}

		setIsFetchingNextPage(true);
		setLoadMoreError(null);

		try {
			const next = await listOpportunitiesServer({
				data: {
					cursor: data.nextCursor,
					status: activeStatus,
					dismissed: dismissedFilter,
					owner: ownerFilter,
					assignee: assigneeFilter,
					...attributes,
					limit: 25
				}
			});
			// Append into the same cache key the suspense query reads, so the accumulated
			// rows survive a route re-mount and flow back through `data.opportunities`.
			queryClient.setQueryData(
				opportunitiesListQueryOptions(
					activeStatus,
					null,
					dismissedFilter,
					ownerFilter,
					assigneeFilter,
					attributes
				).queryKey,
				{
					opportunities: [...data.opportunities, ...next.opportunities],
					nextCursor: next.nextCursor,
					statusCounts: next.statusCounts
				}
			);
		} catch (e) {
			setLoadMoreError(e instanceof Error ? e.message : 'Kon meer aanvragen niet laden');
		} finally {
			setIsFetchingNextPage(false);
		}
	}, [data, isFetchingNextPage, activeStatus, dismissedFilter, ownerFilter, assigneeFilter, attributes, queryClient]);

	// Compact signature of every server-side filter — resets the virtualizer + accumulated
	// rows when ANY filter changes so a stale cursor can't append the previous filter's page.
	const filterKey = [
		activeStatus ?? 'all',
		dismissedFilter,
		ownerFilter ?? 'all',
		assigneeFilter ?? 'all',
		attributes.hasReplies ? 'r' : '',
		attributes.urgency ?? '',
		attributes.deadline ?? '',
		attributes.pendingFollowup ? 'f' : '',
		attributes.hasAppointment ? 'a' : ''
	].join(':');

	return (
		<FixedPageLayout
			header={
				<>
					<PageHeader
						title='Offerteaanvragen'
						caption='Inkomende offerteaanvragen uit je verbonden mailbox. Nieuwe e-mails verschijnen meestal binnen een paar minuten nadat ze binnenkomen.'
					/>

					{/* Smart prioritization — one collapsible insights bar (pending follow-ups + AI tips),
					    collapsed by default so the list stays above the fold. Entitled orgs only;
					    others see the upsell teaser. */}
					{isEntitled ? (
						<OppInsights />
					) : (
						<Box sx={{ mb: 3 }}>
							<UpsellTeaser isOwner={isOwner} />
						</Box>
					)}

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

					<FilterChipRow
						values={{
							owner: ownerFilter,
							assignee: assigneeFilter,
							sort,
							hasReplies: attributes.hasReplies ?? null,
							urgency: attributes.urgency ?? null,
							deadline: attributes.deadline ?? null,
							pendingFollowup: attributes.pendingFollowup ?? null,
							hasAppointment: attributes.hasAppointment ?? null
						}}
						onChange={patch =>
							navigate({
								to: '/opportunities',
								// `sort=newest_first` is the default — drop it from the URL.
								search: {
									...urlSearch,
									...patch,
									...(patch.sort === 'newest_first' ? { sort: undefined } : {})
								},
								replace: true
							})
						}
						onClear={() =>
							navigate({
								to: '/opportunities',
								search: {
									...urlSearch,
									owner: undefined,
									assignee: undefined,
									hasReplies: undefined,
									urgency: undefined,
									deadline: undefined,
									pendingFollowup: undefined,
									hasAppointment: undefined
								},
								replace: true
							})
						}
					/>

					<Stack
						direction={{ xs: 'column', sm: 'row' }}
						useFlexGap
						spacing={2}
						sx={{ mt: 1, mb: 2, alignItems: 'center' }}
					>
						<StandaloneField
							name='search'
							placeholder='Zoek op klant, adres of type…'
							fullWidth
							value={searchInput}
							onChange={e => setSearchInput(e.target.value)}
							endElement={searching ? <CircularProgress size={14} /> : undefined}
						/>
						<StandaloneSwitch
							name='showDismissed'
							label='Toon afgewezen'
							checked={showDismissed}
							onChange={isChecked =>
								navigate({
									to: '/opportunities',
									search: { ...urlSearch, showDismissed: isChecked || undefined },
									replace: true
								})
							}
						/>
					</Stack>

					{loadMoreError && (
						<Banner tone='error' sx={{ mb: 2 }}>
							{loadMoreError}
						</Banner>
					)}
				</>
			}
			scrollRef={listScrollRef}
		>
			{/* `key` resets the virtualizer + accumulated state when ANY filter changes, so a
			    stale cursor can't append the previous filter's rows. */}
			<InfiniteList
				key={filterKey}
				scrollRef={listScrollRef}
				data={visibleOpportunities}
				renderItem={o => <OpportunityRow key={o.id} opportunity={o} />}
				hasNextPage={hasNextPage}
				isFetchingNextPage={isFetchingNextPage}
				onLoadMore={loadMore}
				emptyState={<EmptyState isEntitled={isEntitled} isOwner={isOwner} />}
			/>
		</FixedPageLayout>
	);
}

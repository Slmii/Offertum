import { AppIcon } from '@/components/AppIcon.component';
import { Banner } from '@/components/Banner.component';
import { Field, StandaloneField } from '@/components/Form/Field/Field.component';
import { Form } from '@/components/Form/Form.component';
import { RadioGroup as FormRadioGroup } from '@/components/Form/Radio/Radio.component';
import { StandaloneSelect } from '@/components/Form/Select/Select.component';
import { StandaloneSwitch } from '@/components/Form/Switch/Switch.component';
import { PageHeader } from '@/components/PageContainer.component';
import { PatternBanners } from '@/components/PatternBanners.component';
import { Pill } from '@/components/Pill.component';
import { PillSelect } from '@/components/PillSelect.component';
import { SectionError } from '@/components/SectionError.component';
import { SubscribeCta } from '@/components/SubscribeCta.component';
import { Tabs, type TabItem } from '@/components/Tabs.component';
import { Body, BodySmall } from '@/components/Text.component';
import { LockGlyph, UpsellTeaser } from '@/components/UpsellTeaser.component';
import { listOpportunitiesServer } from '@/lib/api/opportunities.api';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { billingStatusQueryOptions, isBillingEntitled } from '@/lib/queries/billing.queries';
import {
	opportunitiesListQueryOptions,
	OpportunityKeys,
	useDismissOpportunity,
	useUndismissOpportunity,
	useUpdateOpportunityStatus
} from '@/lib/queries/opportunities.queries';
import { myMembershipQueryOptions } from '@/lib/queries/team.queries';
import { DismissOpportunitySchema, type DismissOpportunityForm } from '@/lib/schemas/dismiss-opportunity.schema';
import { toReadableDate, toReadableTimestamp } from '@/lib/utils/date.utils';
import {
	getStatusOptionsForCurrent,
	OPPORTUNITY_DISMISS_REASON_LABELS_NL,
	OPPORTUNITY_SORT_LABELS_NL,
	OPPORTUNITY_SORT_OPTIONS,
	OPPORTUNITY_STATUS_LABELS_NL,
	OPPORTUNITY_STATUS_PILL_TONES,
	OPPORTUNITY_URGENCY_COLORS,
	opportunityCustomerLabel,
	sortOpportunities,
	type OpportunitySortOption
} from '@/lib/utils/opportunity.utils';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import { useTheme } from '@mui/material/styles';
import type {
	Opportunity,
	OpportunityAssigneeFilter,
	OpportunityMailboxOwnershipFilter,
	OpportunityStatus,
	OpportunityStatusCounts
} from '@offertum/shared';
import {
	OPPORTUNITY_ASSIGNEE_FILTERS,
	OPPORTUNITY_DISMISS_REASONS,
	OPPORTUNITY_MAILBOX_OWNERSHIP_FILTERS,
	OPPORTUNITY_STATUSES
} from '@offertum/shared';
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';

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
	assignee: z.enum(OPPORTUNITY_ASSIGNEE_FILTERS).optional().catch(undefined)
});

export const Route = createFileRoute('/(app)/opportunities/')({
	validateSearch: SearchSchema,
	loaderDeps: ({ search: { status, search, showDismissed, owner, assignee } }) => ({
		status: status ?? null,
		// Search is part of loaderDeps so a refresh-with-search-in-URL prefetches the
		// correct filtered first page on the server, not the unfiltered one.
		search: search?.trim() || null,
		showDismissed: showDismissed ?? false,
		owner: owner ?? null,
		assignee: assignee ?? null
	}),
	loader: ({ context, deps }) =>
		Promise.all([
			context.queryClient.ensureQueryData(
				opportunitiesListQueryOptions(
					deps.status,
					deps.search,
					deps.showDismissed ? 'dismissed' : 'active',
					deps.owner,
					deps.assignee
				)
			),
			context.queryClient.ensureQueryData(billingStatusQueryOptions),
			context.queryClient.ensureQueryData(myMembershipQueryOptions)
		]),
	component: OpportunitiesIndexPage,
	errorComponent: SectionError
});

function OpportunitiesIndexPage() {
	const navigate = useNavigate();
	const urlSearch = Route.useSearch();
	const activeStatus = urlSearch.status ?? null;
	const urlSearchTerm = urlSearch.search ?? '';
	const sort: OpportunitySortOption = urlSearch.sort ?? 'newest_first';
	const showDismissed = urlSearch.showDismissed ?? false;
	const dismissedFilter = showDismissed ? 'dismissed' : 'active';
	const ownerFilter = urlSearch.owner ?? null;
	const assigneeFilter = urlSearch.assignee ?? null;

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
		opportunitiesListQueryOptions(activeStatus, urlSearchTerm || null, dismissedFilter, ownerFilter, assigneeFilter)
	);
	const { data: billing } = useSuspenseQuery(billingStatusQueryOptions);
	const { data: me } = useSuspenseQuery(myMembershipQueryOptions);
	const isEntitled = isBillingEntitled(billing.state);
	const isOwner = me.role === 'OWNER';
	const searching = isFetching || debouncedSearch !== urlSearchTerm.trim();

	const visibleOpportunities = useMemo(() => sortOpportunities(data.opportunities, sort), [data.opportunities, sort]);

	return (
		<Stack>
			<PageHeader
				title='Offerteaanvragen'
				caption='Inkomende offerteaanvragen uit je verbonden mailbox. Nieuwe e-mails verschijnen meestal binnen een paar seconden nadat ze binnenkomen.'
			/>

			{/* Smart-prioritization slot: entitled orgs see AI pattern insights, others the upsell. */}
			{isEntitled ? <PatternBanners /> : <UpsellTeaser isOwner={isOwner} />}

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
				owner={ownerFilter}
				assignee={assigneeFilter}
				onOwnerChange={next =>
					navigate({
						to: '/opportunities',
						search: { ...urlSearch, owner: next ?? undefined },
						replace: true
					})
				}
				onAssigneeChange={next =>
					navigate({
						to: '/opportunities',
						search: { ...urlSearch, assignee: next ?? undefined },
						replace: true
					})
				}
				onClear={() =>
					navigate({
						to: '/opportunities',
						search: { ...urlSearch, owner: undefined, assignee: undefined },
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
				<StandaloneSelect
					name='sort'
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
					options={OPPORTUNITY_SORT_OPTIONS.map(sort => ({
						id: sort,
						label: OPPORTUNITY_SORT_LABELS_NL[sort]
					}))}
					sx={{ minWidth: { xs: '100%', sm: 200 } }}
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

			<Stack useFlexGap spacing={1}>
				{visibleOpportunities.length === 0 ? (
					<EmptyState
						filtered={activeStatus !== null || debouncedSearch.length > 0}
						showDismissed={showDismissed}
						isEntitled={isEntitled}
						isOwner={isOwner}
					/>
				) : (
					visibleOpportunities.map(o => <OpportunityRow key={o.id} opportunity={o} />)
				)}
			</Stack>

			{/* `Load more` only makes sense for the un-searched, default-sort list — narrowing
			    by search or non-default sort applies only to the already-loaded page.
			    `key` on the active filters resets the component's cursor + accumulated rows
			    when ANY filter changes — without it React reconciles in place and a click
			    after a filter switch writes the old filter's rows into the new filter's
			    query cache. */}
			{data.nextCursor && debouncedSearch.length === 0 && sort === 'newest_first' && (
				<LoadMoreButton
					key={`${activeStatus ?? 'all'}:${dismissedFilter}:${ownerFilter ?? 'all'}:${assigneeFilter ?? 'all'}`}
					initialCursor={data.nextCursor}
					status={activeStatus}
					dismissed={dismissedFilter}
					owner={ownerFilter}
					assignee={assigneeFilter}
					initialList={data.opportunities}
				/>
			)}
		</Stack>
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

	const items: TabItem<'all' | OpportunityStatus>[] = [
		{ id: 'all', label: 'Alle', count: total },
		...OPPORTUNITY_STATUSES.map(s => ({ id: s, label: OPPORTUNITY_STATUS_LABELS_NL[s], count: counts[s] }))
	];

	return (
		<Tabs
			items={items}
			value={active ?? 'all'}
			variant='underline'
			onChange={id => onChange(id === 'all' ? null : (id as OpportunityStatus))}
		/>
	);
}

function OpportunityRow({ opportunity }: { opportunity: Opportunity }) {
	const { tokens } = useTheme();
	const navigate = useNavigate();
	const status = opportunity.status;
	const isDismissed = opportunity.dismissedAt !== null;
	const pendingCheckIn = opportunity.hasPendingCheckIn && !isDismissed;
	const isNew = (status === 'new' || pendingCheckIn) && !isDismissed;
	const affordance = isNew ? (pendingCheckIn ? 'Beoordeel follow-up' : 'Bekijk concept') : 'Open';
	const deadlineLabel = opportunity.customerDeadline ? toReadableDate(opportunity.customerDeadline) : null;
	const arrivedLabel = toReadableTimestamp(opportunity.internalDate);
	const customerLabel = opportunityCustomerLabel(opportunity);
	const updateStatus = useUpdateOpportunityStatus();
	const undismiss = useUndismissOpportunity();
	const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
	const [dismissOpen, setDismissOpen] = useState(false);
	const c = tokens.color;
	const dur = `${tokens.motion.durBase}ms`;

	const openMenu = (e: React.MouseEvent<HTMLElement>) => {
		e.stopPropagation();
		setMenuAnchor(e.currentTarget);
	};
	const closeMenu = () => setMenuAnchor(null);
	const goToDetail = () => navigate({ to: '/opportunities/$id', params: { id: opportunity.id } });

	return (
		<>
			<Box
				role='button'
				tabIndex={0}
				aria-label={`Open ${customerLabel}`}
				onClick={goToDetail}
				onKeyDown={e => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						goToDetail();
					}
				}}
				sx={{
					position: 'relative',
					overflow: 'hidden',
					display: 'flex',
					alignItems: 'center',
					gap: 2,
					p: '14px 18px 14px 20px',
					borderRadius: `${tokens.radius.md}px`,
					backgroundColor: isDismissed ? c.paper2 : pendingCheckIn ? c.accent[50] : c.surface,
					border: `1px solid ${isDismissed ? c.line : pendingCheckIn ? c.accent[300] : c.line}`,
					opacity: isDismissed ? 0.6 : 1,
					cursor: 'pointer',
					transition: `background ${dur}, border-color ${dur}, transform ${dur}`,
					...(!isDismissed && {
						'&:hover': {
							backgroundColor: pendingCheckIn ? c.accent[100] : c.paper2,
							borderColor: pendingCheckIn ? c.accent[500] : c.lineStrong,
							transform: 'translateX(2px)'
						},
						'&:hover .opp-accent': { opacity: 1, transform: 'translateX(0)' },
						'&:hover .opp-arrived': { opacity: 0 },
						'&:hover .opp-affordance': { opacity: 1, transform: 'translateY(-50%) translateX(0)' },
						'&:hover .opp-kebab': { opacity: 1 }
					})
				}}
			>
				{!isDismissed && (
					<Box
						className='opp-accent'
						aria-hidden='true'
						sx={{
							position: 'absolute',
							left: 0,
							top: 0,
							bottom: 0,
							width: pendingCheckIn ? 4 : 3,
							backgroundColor: isNew ? c.accent[500] : c.accent[300],
							opacity: isNew ? 1 : 0,
							transform: isNew ? 'translateX(0)' : 'translateX(-4px)',
							transition: `opacity ${dur}, transform ${dur}`
						}}
					/>
				)}

				<Box
					aria-label={`Urgentie: ${opportunity.urgency}`}
					sx={{
						width: 10,
						height: 10,
						borderRadius: '50%',
						backgroundColor: OPPORTUNITY_URGENCY_COLORS[opportunity.urgency],
						flexShrink: 0
					}}
				/>

				<Box sx={{ flexShrink: 0 }} onClick={e => e.stopPropagation()}>
					{isDismissed && opportunity.dismissReason ? (
						<Pill tone='lost'>
							Afgewezen · {OPPORTUNITY_DISMISS_REASON_LABELS_NL[opportunity.dismissReason]}
						</Pill>
					) : (
						<PillSelect
							value={status}
							ariaLabel='Status wijzigen'
							disabled={updateStatus.isPending || isDismissed}
							onChange={next => updateStatus.mutate({ id: opportunity.id, status: next })}
							options={getStatusOptionsForCurrent(status).map(sx => ({
								id: sx,
								label: OPPORTUNITY_STATUS_LABELS_NL[sx],
								tone: OPPORTUNITY_STATUS_PILL_TONES[sx]
							}))}
						/>
					)}
				</Box>

				<Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
					<Box
						sx={{
							display: 'flex',
							alignItems: 'baseline',
							gap: 1,
							whiteSpace: 'nowrap',
							overflow: 'hidden'
						}}
					>
						<Body fontWeight='medium' sx={{ flexShrink: 0 }}>
							{customerLabel}
						</Body>
						<Box component='span' sx={{ color: c.ink4 }}>
							·
						</Box>
						<BodySmall color='text.secondary' sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
							{opportunity.requestType}
						</BodySmall>
					</Box>
					{(opportunity.address || deadlineLabel) && (
						<Box
							sx={{
								display: 'flex',
								alignItems: 'center',
								gap: 1.25,
								color: c.ink3,
								fontSize: 12,
								whiteSpace: 'nowrap',
								overflow: 'hidden'
							}}
						>
							{opportunity.address && (
								<Box
									component='span'
									sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}
								>
									<AppIcon name='map-pin' size='small' />
									<Box component='span' sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
										{opportunity.address}
									</Box>
								</Box>
							)}
							{opportunity.address && deadlineLabel && (
								<Box component='span' sx={{ color: c.lineStrong }}>
									·
								</Box>
							)}
							{deadlineLabel && (
								<Box
									component='span'
									sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}
								>
									<AppIcon name='calendar' size='small' />
									<span>{deadlineLabel}</span>
								</Box>
							)}
						</Box>
					)}
					{opportunity.subject && (
						<Box
							component='span'
							sx={{
								fontSize: 12,
								color: c.ink4,
								fontStyle: 'italic',
								overflow: 'hidden',
								textOverflow: 'ellipsis',
								whiteSpace: 'nowrap'
							}}
						>
							{opportunity.subject}
						</Box>
					)}
				</Box>

				<LastActivityBadge lastActivity={opportunity.lastActivity} />

				{opportunity.customerReplyCount > 0 && (
					<Box
						component='span'
						sx={{
							display: 'inline-flex',
							alignItems: 'center',
							gap: 0.5,
							flexShrink: 0,
							px: '8px',
							py: '3px',
							backgroundColor: c.paper2,
							border: `1px solid ${c.line}`,
							color: c.ink2,
							fontSize: 12,
							fontWeight: 'medium',
							borderRadius: `${tokens.radius.sm}px`,
							whiteSpace: 'nowrap'
						}}
					>
						<AppIcon name='corner-up-left' size='small' />
						{opportunity.customerReplyCount}{' '}
						{opportunity.customerReplyCount === 1 ? 'antwoord' : 'antwoorden'}
					</Box>
				)}

				{pendingCheckIn && (
					<Box
						component='span'
						onClick={e => e.stopPropagation()}
						title='Een automatische follow-up wacht op je beoordeling'
						sx={{
							display: 'inline-flex',
							alignItems: 'center',
							gap: 0.75,
							flexShrink: 0,
							px: '8px',
							py: '4px',
							backgroundColor: c.accent[500],
							color: c.surface,
							fontSize: 12,
							fontWeight: 'bold',
							borderRadius: `${tokens.radius.sm}px`,
							whiteSpace: 'nowrap'
						}}
					>
						<AppIcon name='sparkles' size='small' /> Follow-up wacht
					</Box>
				)}

				<Box
					sx={{
						flexShrink: 0,
						position: 'relative',
						minWidth: 110,
						textAlign: 'right',
						fontSize: 12,
						color: c.ink4
					}}
				>
					<Box
						component='span'
						className='opp-arrived'
						sx={{ display: 'inline-block', transition: `opacity ${dur}` }}
					>
						{arrivedLabel}
					</Box>
					<Box
						component='span'
						className='opp-affordance'
						aria-hidden='true'
						sx={{
							position: 'absolute',
							right: 0,
							top: '50%',
							transform: 'translateY(-50%) translateX(8px)',
							opacity: 0,
							pointerEvents: 'none',
							display: 'inline-flex',
							alignItems: 'center',
							gap: 0.5,
							color: c.accent[700],
							fontWeight: 'bold',
							whiteSpace: 'nowrap',
							transition: `opacity ${dur}, transform ${dur}`
						}}
					>
						{affordance} <AppIcon name='arrow-right' size='small' />
					</Box>
				</Box>

				<Box sx={{ flexShrink: 0 }} onClick={e => e.stopPropagation()}>
					<IconButton
						className='opp-kebab'
						size='small'
						onClick={openMenu}
						aria-label='Acties'
						sx={{ opacity: 0.6, transition: `opacity ${dur}` }}
					>
						<AppIcon name='dots-vertical' size='medium' />
					</IconButton>
					<Menu anchorEl={menuAnchor} open={menuAnchor !== null} onClose={closeMenu}>
						{isDismissed ? (
							<MenuItem
								onClick={() => {
									closeMenu();
									undismiss.mutate({ id: opportunity.id });
								}}
								disabled={undismiss.isPending}
							>
								Niet afgewezen
							</MenuItem>
						) : (
							<MenuItem
								onClick={() => {
									closeMenu();
									setDismissOpen(true);
								}}
							>
								Markeer als geen offerteaanvraag…
							</MenuItem>
						)}
					</Menu>
				</Box>
			</Box>

			{dismissOpen && (
				<DismissDialog
					opportunityId={opportunity.id}
					replyDraftSentAt={opportunity.replyDraftSentAt}
					onClose={() => setDismissOpen(false)}
				/>
			)}
		</>
	);
}

function LastActivityBadge({ lastActivity }: { lastActivity: Opportunity['lastActivity'] }) {
	const { tokens } = useTheme();
	if (!lastActivity) {
		return null;
	}

	const c = tokens.color;
	// Icon + accent vary by actor kind: customer reply, Offertum/system, or owner edit.
	const icon =
		lastActivity.kind === 'customer' ? 'corner-up-left' : lastActivity.kind === 'system' ? 'sparkles' : 'user';
	const iconColor = lastActivity.kind === 'system' ? c.accent[500] : c.ink4;
	return (
		<Box
			component='span'
			sx={{
				display: 'inline-flex',
				alignItems: 'center',
				gap: 0.625,
				flexShrink: 0,
				px: '7px',
				py: '2px',
				backgroundColor: c.paper2,
				border: `1px solid ${c.line}`,
				color: c.ink3,
				fontSize: 11,
				fontWeight: 'medium',
				borderRadius: `${tokens.radius.sm}px`,
				whiteSpace: 'nowrap'
			}}
		>
			<Box component='span' sx={{ display: 'inline-flex', color: iconColor }}>
				<AppIcon name={icon} size='small' />
			</Box>
			<Box component='span' sx={{ color: c.ink2 }}>
				{lastActivity.label}
			</Box>
			<Box component='span' sx={{ color: c.ink4 }}>
				·
			</Box>
			<Box component='span' sx={{ fontVariantNumeric: 'tabular-nums' }}>
				{toReadableTimestamp(lastActivity.at)}
			</Box>
		</Box>
	);
}

function FilterChipRow({
	owner,
	assignee,
	onOwnerChange,
	onAssigneeChange,
	onClear
}: {
	owner: OpportunityMailboxOwnershipFilter | null;
	assignee: OpportunityAssigneeFilter | null;
	onOwnerChange: (next: OpportunityMailboxOwnershipFilter | null) => void;
	onAssigneeChange: (next: OpportunityAssigneeFilter | null) => void;
	onClear: () => void;
}) {
	const { tokens } = useTheme();
	const anyActive = owner !== null || assignee !== null;
	return (
		<Stack direction='row' useFlexGap spacing={1} sx={{ flexWrap: 'wrap', alignItems: 'center', mt: 2 }}>
			<FilterChip
				label='Mailbox'
				icon='mail'
				value={owner ?? 'all'}
				options={[
					{ value: 'all', label: 'Alle mailboxen' },
					{ value: 'mine', label: 'Mijn mailbox' }
				]}
				onChange={v => onOwnerChange(v === 'all' ? null : (v as OpportunityMailboxOwnershipFilter))}
			/>
			<FilterChip
				label='Toegewezen'
				icon='user'
				value={assignee ?? 'all'}
				options={[
					{ value: 'all', label: 'Iedereen' },
					{ value: 'me', label: 'Aan mij' },
					{ value: 'unassigned', label: 'Niet toegewezen' }
				]}
				onChange={v => onAssigneeChange(v === 'all' ? null : (v as OpportunityAssigneeFilter))}
			/>
			{anyActive && (
				<Button
					variant='text'
					size='small'
					onClick={onClear}
					startIcon={<AppIcon name='x' size='small' />}
					sx={{ color: tokens.color.ink3 }}
				>
					Wis filters
				</Button>
			)}
		</Stack>
	);
}

function FilterChip({
	label,
	icon,
	value,
	options,
	onChange
}: {
	label: string;
	icon: 'mail' | 'user';
	value: string;
	options: { value: string; label: string }[];
	onChange: (value: string) => void;
}) {
	const { tokens } = useTheme();
	const c = tokens.color;
	const [anchor, setAnchor] = useState<HTMLElement | null>(null);
	const selected = options.find(o => o.value === value);
	const active = value !== 'all';
	return (
		<>
			<Box
				component='button'
				type='button'
				onClick={e => setAnchor(e.currentTarget)}
				sx={{
					display: 'inline-flex',
					alignItems: 'center',
					gap: 0.75,
					height: 28,
					px: 1.25,
					backgroundColor: active ? c.accent[50] : c.surface,
					border: `1px solid ${active ? c.accent[500] : c.lineStrong}`,
					borderRadius: `${tokens.radius.sm}px`,
					color: active ? c.accent[700] : c.ink2,
					fontSize: 12,
					fontWeight: 'medium',
					fontFamily: tokens.font.sans,
					cursor: 'pointer',
					whiteSpace: 'nowrap',
					transition: `background ${tokens.motion.durFast}ms, border-color ${tokens.motion.durFast}ms`
				}}
			>
				<AppIcon name={icon} size='small' />
				<Box component='span' sx={{ color: active ? c.accent[700] : c.ink4 }}>
					{label}:
				</Box>
				<Box component='span' sx={{ fontWeight: 'bold' }}>
					{selected?.label}
				</Box>
				<AppIcon name='chevron-down' size='small' />
			</Box>
			<Menu
				anchorEl={anchor}
				open={Boolean(anchor)}
				onClose={() => setAnchor(null)}
				anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
				transformOrigin={{ vertical: 'top', horizontal: 'left' }}
			>
				{options.map(o => (
					<MenuItem
						key={o.value}
						selected={o.value === value}
						onClick={() => {
							onChange(o.value);
							setAnchor(null);
						}}
					>
						<Box component='span' sx={{ width: 16, display: 'inline-flex', flexShrink: 0 }}>
							{o.value === value && <AppIcon name='check' size='small' />}
						</Box>
						{o.label}
					</MenuItem>
				))}
			</Menu>
		</>
	);
}

const DISMISS_FORM_ID = 'dismiss-opportunity-form';

function DismissDialog({
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

function EmptyState({
	filtered,
	showDismissed,
	isEntitled,
	isOwner
}: {
	filtered: boolean;
	showDismissed: boolean;
	isEntitled: boolean;
	isOwner: boolean;
}) {
	if (showDismissed) {
		return (
			<Paper variant='outlined' sx={{ p: 4, textAlign: 'center', borderStyle: 'dashed' }}>
				<BodySmall color='text.secondary'>Geen afgewezen offerteaanvragen.</BodySmall>
			</Paper>
		);
	}
	// Filter-empty: a status tab or search is active, just no matching results.
	// Show a neutral "no match" message regardless of entitlement — the user is already
	// interacting with the list; the subscribe nudge would be a non-sequitur here.
	if (filtered) {
		return (
			<Paper variant='outlined' sx={{ p: 4, textAlign: 'center', borderStyle: 'dashed' }}>
				<BodySmall color='text.secondary'>Geen offerteaanvragen die hierop matchen.</BodySmall>
			</Paper>
		);
	}
	// Feature-empty (no filter active) + NOT entitled: the user can't connect a mailbox
	// yet, so the current "wait for your connected mailbox" copy is misleading. Nudge them
	// to subscribe instead.
	if (!isEntitled) {
		return (
			<Paper variant='outlined' sx={{ p: 4, textAlign: 'center', borderStyle: 'dashed' }}>
				<Stack useFlexGap spacing={1.5} sx={{ alignItems: 'center' }}>
					<LockGlyph size={24} />
					<Body fontWeight='medium'>Nog geen offerteaanvragen.</Body>
					<BodySmall color='text.secondary'>
						Abonneer en verbind je mailbox om offerteaanvragen automatisch binnen te halen.
					</BodySmall>
					<SubscribeCta isOwner={isOwner} />
				</Stack>
			</Paper>
		);
	}
	// Feature-empty + entitled: mailbox can be connected; the original copy is correct.
	return (
		<Paper variant='outlined' sx={{ p: 4, textAlign: 'center', borderStyle: 'dashed' }}>
			<Body fontWeight='medium' sx={{ mb: 1 }}>
				Nog geen offerteaanvragen.
			</Body>
			<BodySmall color='text.secondary'>
				Zodra er een binnenkomt op je verbonden mailbox, zie je 'm hier, meestal binnen een paar seconden.
			</BodySmall>
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
	dismissed,
	owner,
	assignee,
	initialList
}: {
	initialCursor: string;
	status: OpportunityStatus | null;
	dismissed: 'active' | 'dismissed';
	owner: OpportunityMailboxOwnershipFilter | null;
	assignee: OpportunityAssigneeFilter | null;
	initialList: Opportunity[];
}) {
	const queryClient = useQueryClient();
	const [cursor, setCursor] = useState<string | null>(initialCursor);
	const extraRef = useRef<Opportunity[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const onClick = async () => {
		if (!cursor) {
			return;
		}

		setLoading(true);
		setError(null);

		try {
			const next = await listOpportunitiesServer({
				data: { cursor, status, dismissed, owner, assignee, limit: 25 }
			});
			extraRef.current = [...extraRef.current, ...next.opportunities];
			const accumulated = [...initialList, ...extraRef.current];
			setCursor(next.nextCursor);
			// Mirror the appended rows into the React Query cache so a re-mount of the
			// route doesn't lose the user's "Load more" history.
			queryClient.setQueryData(OpportunityKeys.list(status, null, dismissed, owner, assignee), {
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
				<Banner tone='error' sx={{ mb: 2 }}>
					{error}
				</Banner>
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

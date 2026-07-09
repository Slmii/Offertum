import { AppIcon, type AppIconName } from '@/components/AppIcon.component';
import { Avatar } from '@/components/Avatar.component';
import { membershipsQueryOptions, myMembershipQueryOptions } from '@/lib/queries/team.queries';
import {
	OPPORTUNITY_SORT_LABELS_NL,
	OPPORTUNITY_SORT_OPTIONS,
	OPPORTUNITY_URGENCY_LABELS_NL,
	type OpportunitySortOption
} from '@/lib/utils/opportunity.utils';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import { useTheme } from '@mui/material/styles';
import {
	OPPORTUNITY_URGENCIES,
	pluralize,
	type OpportunityDeadlineFilter,
	type OpportunityMailboxOwnershipFilter,
	type OpportunityUrgency
} from '@offertum/shared';
import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

/**
 * Current value of every list filter the chip row controls. `null`/`false` = inactive
 * (the chip shows its default option, untinted).
 */
export interface OpportunityFilterValues {
	owner: OpportunityMailboxOwnershipFilter | null;
	/** Multiselect: each entry is `'me'`, `'unassigned'`, or a specific user ID. */
	assignee: string[];
	sort: OpportunitySortOption;
	hasReplies: boolean | null;
	urgency: OpportunityUrgency | null;
	deadline: OpportunityDeadlineFilter | null;
	pendingFollowup: boolean | null;
	hasAppointment: boolean | null;
}

/** A patch of URL search params — `undefined` removes a param (back to its default). */
export type OpportunityFilterPatch = {
	owner?: OpportunityMailboxOwnershipFilter;
	assignee?: string[] | undefined;
	sort?: OpportunitySortOption;
	hasReplies?: true;
	urgency?: OpportunityUrgency;
	deadline?: OpportunityDeadlineFilter;
	pendingFollowup?: true;
	hasAppointment?: true;
};

const DEADLINE_LABELS: Record<OpportunityDeadlineFilter, string> = {
	all: 'Alle',
	has: 'Heeft deadline',
	overdue: 'Verlopen',
	soon: 'Binnenkort'
};

/**
 * The filter chip row beneath the status tabs. Each chip is a `label: value ▾` button opening
 * a menu; an active (non-default) chip is accent-tinted. Emits a URL-param patch via `onChange`
 * and a full reset via `onClear`. (Status lives in the tab row, not here.)
 */
export function FilterChipRow({
	values,
	onChange,
	onClear
}: {
	values: OpportunityFilterValues;
	onChange: (patch: OpportunityFilterPatch) => void;
	onClear: () => void;
}) {
	const { tokens } = useTheme();
	// Non-suspense reads: this component also renders inside `OpportunitiesListSkeleton`
	// (the route's `pendingComponent`), which is shown WHILE the loader — the thing that
	// prefetches these queries — is still in flight. `useSuspenseQuery` there would throw
	// a promise with no ancestor `<Suspense>` boundary to catch it. On the real page the
	// route loader has already prefetched both via `ensureQueryData`, so `data` is
	// available on first render regardless.
	const { data: memberships = [] } = useQuery(membershipsQueryOptions);
	const { data: me } = useQuery(myMembershipQueryOptions);
	const anyActive =
		values.owner !== null ||
		values.assignee.length > 0 ||
		values.hasReplies === true ||
		values.urgency !== null ||
		(values.deadline !== null && values.deadline !== 'all') ||
		values.pendingFollowup === true ||
		values.hasAppointment === true;

	const assigneeOptions = [
		{ value: 'unassigned', label: 'Niet toegewezen', avatar: <UnassignedAvatar /> },
		...memberships
			.filter(m => m.role !== 'EXTERNAL')
			.map(m => {
				const displayName = m.user.name?.trim() || m.user.email;
				const isMe = m.user.id === me?.user.id;
				return {
					value: m.user.id,
					label: displayName + (isMe ? ' · jij' : ''),
					avatar: <Avatar name={displayName} size={24} accent={isMe} />
				};
			})
	];

	return (
		<Stack direction='row' useFlexGap spacing={1} sx={{ flexWrap: 'wrap', alignItems: 'center', mt: 2 }}>
			<FilterChip
				label='Mailbox'
				icon='mail'
				value={values.owner ?? 'all'}
				options={[
					{ value: 'all', label: 'Alle mailboxen' },
					{ value: 'mine', label: 'Mijn mailbox' }
				]}
				onChange={v => onChange({ owner: v === 'all' ? undefined : (v as OpportunityMailboxOwnershipFilter) })}
			/>
			<MultiFilterChip
				label='Toegewezen'
				icon='user'
				value={values.assignee}
				options={assigneeOptions}
				emptyLabel='Iedereen'
				itemSingular='persoon'
				itemPlural='personen'
				onChange={v => onChange({ assignee: v.length > 0 ? v : undefined })}
			/>
			<FilterChip
				label='Urgentie'
				icon='alert-triangle'
				value={values.urgency ?? 'all'}
				options={[
					{ value: 'all', label: 'Alle' },
					...OPPORTUNITY_URGENCIES.map(u => ({ value: u, label: OPPORTUNITY_URGENCY_LABELS_NL[u] }))
				]}
				onChange={v => onChange({ urgency: v === 'all' ? undefined : (v as OpportunityUrgency) })}
			/>
			<FilterChip
				label='Deadline'
				icon='calendar'
				value={values.deadline ?? 'all'}
				options={(['all', 'has', 'overdue', 'soon'] satisfies OpportunityDeadlineFilter[]).map(d => ({
					value: d,
					label: DEADLINE_LABELS[d]
				}))}
				onChange={v => onChange({ deadline: v === 'all' ? undefined : (v as OpportunityDeadlineFilter) })}
			/>
			<FilterChip
				label='Antwoorden'
				icon='corner-up-left'
				value={values.hasReplies ? 'yes' : 'all'}
				options={[
					{ value: 'all', label: 'Alle' },
					{ value: 'yes', label: 'Met antwoord' }
				]}
				onChange={v => onChange({ hasReplies: v === 'yes' ? true : undefined })}
			/>
			<FilterChip
				label='Follow-up'
				icon='sparkles'
				value={values.pendingFollowup ? 'yes' : 'all'}
				options={[
					{ value: 'all', label: 'Alle' },
					{ value: 'yes', label: 'Wacht op review' }
				]}
				onChange={v => onChange({ pendingFollowup: v === 'yes' ? true : undefined })}
			/>
			<FilterChip
				label='Afspraak'
				icon='clock'
				value={values.hasAppointment ? 'yes' : 'all'}
				options={[
					{ value: 'all', label: 'Alle' },
					{ value: 'yes', label: 'Met afspraak' }
				]}
				onChange={v => onChange({ hasAppointment: v === 'yes' ? true : undefined })}
			/>
			<FilterChip
				label='Sorteer'
				icon='arrows-sort'
				value={values.sort}
				inactiveValue='newest_first'
				options={OPPORTUNITY_SORT_OPTIONS.map(option => ({
					value: option,
					label: OPPORTUNITY_SORT_LABELS_NL[option]
				}))}
				onChange={v => onChange({ sort: v as OpportunitySortOption })}
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

/** A single filter chip + its dropdown menu. Internal to `FilterChipRow`. */
function FilterChip({
	label,
	icon,
	value,
	options,
	onChange,
	inactiveValue = 'all'
}: {
	label: string;
	icon: AppIconName;
	value: string;
	options: { value: string; label: string }[];
	onChange: (value: string) => void;
	inactiveValue?: string;
}) {
	const { tokens } = useTheme();
	const [anchor, setAnchor] = useState<HTMLElement | null>(null);

	const c = tokens.color;
	const selected = options.find(o => o.value === value);
	const active = value !== inactiveValue;

	return (
		<>
			<ButtonBase
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
			</ButtonBase>
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

/** Dashed placeholder avatar for the "Niet toegewezen" option — matches the AssigneePicker glyph. */
function UnassignedAvatar({ size = 24 }: { size?: number }) {
	const { tokens } = useTheme();
	return (
		<Box
			component='span'
			aria-hidden='true'
			sx={{
				width: size,
				height: size,
				borderRadius: `${tokens.radius.sm}px`,
				border: `1px dashed ${tokens.color.lineStrong}`,
				display: 'inline-flex',
				alignItems: 'center',
				justifyContent: 'center',
				flexShrink: 0,
				color: tokens.color.ink4
			}}
		>
			<AppIcon name='user' size='small' />
		</Box>
	);
}

/**
 * Multiselect variant of `FilterChip`. Toggling an option keeps the menu open (so the
 * owner can pick several team members in one go) — it only closes on backdrop click or
 * Escape (native `Menu` `onClose` behavior). Trigger label collapses to the single
 * option's label when exactly one is selected, or `"N personen"` otherwise.
 */
function MultiFilterChip({
	label,
	icon,
	value,
	options,
	onChange,
	emptyLabel,
	itemSingular,
	itemPlural
}: {
	label: string;
	icon: AppIconName;
	value: string[];
	options: { value: string; label: string; avatar?: ReactNode }[];
	onChange: (value: string[]) => void;
	emptyLabel: string;
	itemSingular: string;
	itemPlural: string;
}) {
	const { tokens } = useTheme();
	const [anchor, setAnchor] = useState<HTMLElement | null>(null);

	const c = tokens.color;
	const active = value.length > 0;
	const triggerLabel =
		value.length === 0
			? emptyLabel
			: value.length === 1
				? (options.find(o => o.value === value[0])?.label ?? emptyLabel)
				: `${value.length} ${pluralize(value.length, itemSingular, itemPlural)}`;

	const toggle = (optionValue: string) => {
		onChange(value.includes(optionValue) ? value.filter(v => v !== optionValue) : [...value, optionValue]);
	};

	return (
		<>
			<ButtonBase
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
					{triggerLabel}
				</Box>
				<AppIcon name='chevron-down' size='small' />
			</ButtonBase>
			<Menu
				anchorEl={anchor}
				open={Boolean(anchor)}
				onClose={() => setAnchor(null)}
				anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
				transformOrigin={{ vertical: 'top', horizontal: 'left' }}
			>
				{options.map(o => (
					<MenuItem key={o.value} selected={value.includes(o.value)} onClick={() => toggle(o.value)}>
						<Box component='span' sx={{ width: 16, display: 'inline-flex', flexShrink: 0 }}>
							{value.includes(o.value) && <AppIcon name='check' size='small' />}
						</Box>
						{o.avatar && (
							<Box component='span' sx={{ mr: 1, display: 'inline-flex' }}>
								{o.avatar}
							</Box>
						)}
						{o.label}
					</MenuItem>
				))}
			</Menu>
		</>
	);
}

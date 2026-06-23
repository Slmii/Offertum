import { FixedPageLayout } from '@/components/FixedPageLayout.component';
import { StandaloneField } from '@/components/Form/Field/Field.component';
import { StandaloneSwitch } from '@/components/Form/Switch/Switch.component';
import { PageHeader } from '@/components/PageHeader.component';
import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import { useTheme } from '@mui/material/styles';
import type { OpportunityStatusCounts } from '@offertum/shared';
import { FilterChipRow, type OpportunityFilterValues } from './FilterChipRow.component';
import { StatusFilterTabs } from './StatusFilterTabs.component';

const noop = () => {};

// The chrome renders in its default (no-filter) state during the brief loading flash —
// only the list rows are skeletonised, so the header, tabs, filters and search stay put.
const ZERO_COUNTS: OpportunityStatusCounts = { new: 0, replied: 0, waiting: 0, cold: 0, won: 0, lost: 0 };
const DEFAULT_FILTERS: OpportunityFilterValues = {
	owner: null,
	assignee: null,
	sort: 'newest_first',
	hasReplies: null,
	urgency: null,
	deadline: null,
	pendingFollowup: null,
	hasAppointment: null
};

/**
 * Loading state for the opportunities list (route `pendingComponent`). The page chrome —
 * title, status tabs, filter chips and the search toolbar — renders as the real (inert)
 * controls so the layout never jumps; only the list rows are skeletonised. Uses MUI's
 * pulse animation, matching the design system's "skeletons fade into real content".
 */
export function OpportunitiesListSkeleton() {
	const { tokens } = useTheme();
	const radiusSm = `${tokens.radius.sm}px`;
	const radiusMd = `${tokens.radius.md}px`;

	return (
		<FixedPageLayout
			header={
				<>
					<PageHeader
						title='Offerteaanvragen'
						caption='Inkomende offerteaanvragen uit je verbonden mailbox. Nieuwe e-mails verschijnen meestal binnen een paar minuten nadat ze binnenkomen.'
					/>

					<StatusFilterTabs active={null} counts={ZERO_COUNTS} onChange={noop} />

					<FilterChipRow values={DEFAULT_FILTERS} onChange={noop} onClear={noop} />

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
							value=''
							onChange={noop}
						/>
						<StandaloneSwitch name='showDismissed' label='Toon afgewezen' checked={false} onChange={noop} />
					</Stack>
				</>
			}
		>
			<Stack useFlexGap spacing={1} aria-busy='true'>
				{Array.from({ length: 6 }, (_, i) => (
					<SkeletonRow key={i} radiusSm={radiusSm} radiusMd={radiusMd} />
				))}
			</Stack>
		</FixedPageLayout>
	);
}

function SkeletonRow({ radiusSm, radiusMd }: { radiusSm: string; radiusMd: string }) {
	const { tokens } = useTheme();
	return (
		<Box
			sx={{
				display: 'flex',
				alignItems: 'center',
				gap: 2,
				padding: '16px 20px 16px 22px',
				backgroundColor: tokens.color.surface,
				border: `1px solid ${tokens.color.line}`,
				borderRadius: radiusMd
			}}
		>
			{/* Urgency dot */}
			<Skeleton variant='circular' width={10} height={10} sx={{ flexShrink: 0 }} />
			{/* Status chip */}
			<Skeleton variant='rounded' width={78} height={22} sx={{ borderRadius: radiusSm, flexShrink: 0 }} />
			{/* Main content — two lines */}
			<Stack useFlexGap spacing={1} sx={{ flex: 1, minWidth: 0 }}>
				<Skeleton variant='rounded' height={13} sx={{ borderRadius: radiusSm, width: '42%', minWidth: 160 }} />
				<Skeleton variant='rounded' height={11} sx={{ borderRadius: radiusSm, width: '28%', minWidth: 110 }} />
			</Stack>
			{/* Right meta */}
			<Skeleton variant='rounded' width={90} height={11} sx={{ borderRadius: radiusSm, flexShrink: 0 }} />
		</Box>
	);
}

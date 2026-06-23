import { Tabs, type TabItem } from '@/components/Tabs.component';
import { OPPORTUNITY_STATUS_LABELS_NL } from '@/lib/utils/opportunity.utils';
import type { OpportunityStatus, OpportunityStatusCounts } from '@offertum/shared';
import { OPPORTUNITY_STATUSES } from '@offertum/shared';

/** The status funnel as an underline tab row with per-status counts ("Alle" = total). */
export function StatusFilterTabs({
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

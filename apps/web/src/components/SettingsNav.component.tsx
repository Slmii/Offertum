import { AppIcon } from '@/components/AppIcon.component';
import { Tabs, type TabItem } from '@/components/Tabs.component';
import { billingStatusQueryOptions, isBillingEntitled } from '@/lib/queries/billing.queries';
import { myMembershipQueryOptions } from '@/lib/queries/team.queries';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useNavigate, useRouterState } from '@tanstack/react-router';

type SettingsRoute =
	| '/settings/email'
	| '/settings/writing-style'
	| '/settings/business-details'
	| '/settings/catalog'
	| '/settings/pricing-playbook'
	| '/settings/follow-ups'
	| '/settings/notifications'
	| '/settings/calendar'
	| '/settings/integrations';

interface SettingsTab {
	to: SettingsRoute;
	label: string;
	// Owner-only routes redirect non-owners to `/`, so hide their tabs for members.
	ownerOnly: boolean;
	// Subscription-gated routes show a lock when the org isn't entitled (the upsell hint).
	lockedWhenNotEntitled: boolean;
}

const SETTINGS_TABS: SettingsTab[] = [
	{ to: '/settings/email', label: 'E-mailaccounts', ownerOnly: false, lockedWhenNotEntitled: false },
	{ to: '/settings/writing-style', label: 'Schrijfstijl', ownerOnly: false, lockedWhenNotEntitled: false },
	{ to: '/settings/business-details', label: 'Bedrijfsgegevens', ownerOnly: false, lockedWhenNotEntitled: false },
	{ to: '/settings/catalog', label: 'Catalogus', ownerOnly: true, lockedWhenNotEntitled: false },
	{ to: '/settings/pricing-playbook', label: 'Prijsregels', ownerOnly: true, lockedWhenNotEntitled: true },
	{ to: '/settings/follow-ups', label: 'Follow-ups', ownerOnly: true, lockedWhenNotEntitled: false },
	{ to: '/settings/notifications', label: 'Notificaties', ownerOnly: false, lockedWhenNotEntitled: false },
	{ to: '/settings/calendar', label: 'Agenda-synchronisatie', ownerOnly: false, lockedWhenNotEntitled: false },
	{ to: '/settings/integrations', label: 'Integraties', ownerOnly: false, lockedWhenNotEntitled: true }
];

/**
 * Sub-navigation for the Settings area — ported from the design's `SettingsTabs`. Without
 * it, most settings routes are unreachable from the new app shell. Rendered once by the
 * settings layout so every settings page carries the same tab bar.
 *
 * Built on the shared `Tabs` component (underline variant) so it stays visually identical to
 * the tab rows elsewhere (e.g. Opportunities); navigation happens on change. Owner-only routes
 * hide their tab for non-owners (they'd redirect to `/`). Subscription-gated routes keep their
 * tab but show a lock when the org isn't entitled, matching the design's upsell affordance —
 * the page itself then renders the subscribe CTA.
 */
export function SettingsNav() {
	const { tokens } = useTheme();
	const navigate = useNavigate();
	const pathname = useRouterState({ select: s => s.location.pathname });
	const { data: me } = useSuspenseQuery(myMembershipQueryOptions);
	const { data: billing } = useSuspenseQuery(billingStatusQueryOptions);
	const isOwner = me.role === 'OWNER';
	const isEntitled = isBillingEntitled(billing.state);

	const tabs = SETTINGS_TABS.filter(tab => isOwner || !tab.ownerOnly);

	// Match the longest `to` that prefixes the current path (exact for most; prefix lets a
	// future nested settings route still highlight its parent tab). '' if none match.
	const active = tabs.find(tab => pathname === tab.to || pathname.startsWith(`${tab.to}/`))?.to ?? '';

	const items: TabItem<string>[] = tabs.map(tab => {
		const locked = !isEntitled && tab.lockedWhenNotEntitled;
		return {
			id: tab.to,
			label: locked ? (
				<Box component='span' sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
					{tab.label}
					<AppIcon name='lock' size='small' style={{ color: tokens.color.ink4 }} />
				</Box>
			) : (
				tab.label
			)
		};
	});

	return (
		<Box sx={{ mb: 3 }}>
			<Tabs
				items={items}
				value={active}
				onChange={to => navigate({ to: to as SettingsRoute })}
				variant='underline'
			/>
		</Box>
	);
}

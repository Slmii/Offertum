import { AppIcon, type AppIconName } from '@/components/AppIcon.component';
import { Avatar } from '@/components/Avatar.component';
import { Overline } from '@/components/Text.component';
import { useThemeMode } from '@/lib/hooks/use-theme-mode';
import { useSignOut } from '@/lib/queries/auth.queries';
import { billingStatusQueryOptions, isBillingEntitled } from '@/lib/queries/billing.queries';
import {
	myMembershipQueryOptions,
	myOrganizationsQueryOptions,
	useSwitchOrganization
} from '@/lib/queries/team.queries';
import type { ThemeMode } from '@/lib/utils/theme.utils';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import { useTheme } from '@mui/material/styles';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { Fragment, useState, type MouseEvent } from 'react';

// The concrete routes the shell links to. Typing `to` as this union (not `string`) keeps
// it assignable to TanStack Router's strictly-typed `Link.to` without per-call casts.
type AppRoute =
	| '/'
	| '/opportunities'
	| '/calendar'
	| '/catalog'
	| '/settings/email'
	| '/settings/writing-style'
	| '/settings/organization'
	| '/settings/pricing-playbook'
	| '/settings/follow-ups'
	| '/settings/notifications'
	| '/settings/integrations'
	| '/team'
	| '/billing'
	| '/admin/ai-usage'
	| '/admin/classifier-quality';

interface NavEntry {
	to: AppRoute;
	label: string;
	icon: AppIconName;
	// Entitlement-gated destination (calendar, catalog). When the org isn't entitled the item
	// shows a padlock and routes to /billing instead of its own route.
	gated?: boolean;
}

const PRIMARY_NAV: NavEntry[] = [
	{ to: '/', label: 'Dashboard', icon: 'dashboard' },
	{ to: '/opportunities', label: 'Offerteaanvragen', icon: 'inbox' },
	{ to: '/calendar', label: 'Kalender', icon: 'calendar', gated: true },
	{ to: '/catalog', label: 'Catalogus', icon: 'package', gated: true },
	{ to: '/settings/email', label: 'Instellingen', icon: 'settings' },
	{ to: '/team', label: 'Team', icon: 'users' },
	{ to: '/billing', label: 'Abonnement', icon: 'credit-card' }
];

const BILLING_ROUTE: AppRoute = '/billing';

const ADMIN_NAV: NavEntry[] = [
	{ to: '/admin/ai-usage', label: 'AI-gebruik', icon: 'activity' },
	{ to: '/admin/classifier-quality', label: 'Classifier-kwaliteit', icon: 'target' }
];

// The `/settings/email` primary item is the "Instellingen" parent; while the user is on any
// settings route it expands these children inline beneath it (design "Variant B").
interface SettingsSubEntry {
	to: AppRoute;
	label: string;
	icon: AppIconName;
	// Owner-only pages redirect non-owners to `/`, so hide their sub-item for members.
	ownerOnly: boolean;
	// Subscription-gated pages show a padlock when the org isn't entitled (the page hosts the upsell).
	lockedWhenNotEntitled: boolean;
}

const SETTINGS_SUB_NAV: SettingsSubEntry[] = [
	{ to: '/settings/email', label: 'E-mailaccounts', icon: 'mail', ownerOnly: false, lockedWhenNotEntitled: false },
	{
		to: '/settings/writing-style',
		label: 'Schrijfstijl',
		icon: 'pen-line',
		ownerOnly: false,
		lockedWhenNotEntitled: false
	},
	{
		to: '/settings/organization',
		label: 'Organisatie',
		icon: 'building',
		ownerOnly: false,
		lockedWhenNotEntitled: false
	},
	{
		to: '/settings/pricing-playbook',
		label: 'Prijsregels',
		icon: 'calculator',
		ownerOnly: true,
		lockedWhenNotEntitled: true
	},
	{ to: '/settings/follow-ups', label: 'Follow-ups', icon: 'clock', ownerOnly: true, lockedWhenNotEntitled: false },
	{
		to: '/settings/notifications',
		label: 'Notificaties',
		icon: 'bell',
		ownerOnly: false,
		lockedWhenNotEntitled: false
	},
	{ to: '/settings/integrations', label: 'Integraties', icon: 'plug', ownerOnly: false, lockedWhenNotEntitled: true }
];

// The primary-nav "Instellingen" item points here; used to detect the settings parent in the render.
const SETTINGS_PARENT_ROUTE: AppRoute = '/settings/email';

interface SidebarProps {
	collapsed: boolean;
	onToggleCollapsed: () => void;
}

export function Sidebar({ collapsed, onToggleCollapsed }: SidebarProps) {
	const theme = useTheme();
	const { tokens } = theme;
	const pathname = useRouterState({ select: s => s.location.pathname });

	const { data: me } = useSuspenseQuery(myMembershipQueryOptions);
	const { data: billing } = useSuspenseQuery(billingStatusQueryOptions);
	const isAdmin = me.user.isAdmin;
	const isOwner = me.role === 'OWNER';
	const isEntitled = isBillingEntitled(billing.state);

	// `/` must match exactly; everything else matches by path prefix so child routes
	// (e.g. /opportunities/:id, /settings/email) keep their parent nav item active.
	const isActive = (to: string): boolean => (to === '/' ? pathname === '/' : pathname.startsWith(to));

	return (
		<Box
			component='aside'
			sx={{
				backgroundColor: tokens.color.paper2,
				borderRight: `1px solid ${tokens.color.line}`,
				display: 'flex',
				flexDirection: 'column',
				position: 'sticky',
				top: 0,
				height: '100vh',
				overflow: 'hidden'
			}}
		>
			{/* Logo row */}
			<Box
				sx={{
					height: 64,
					px: 2,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					flexShrink: 0
				}}
			>
				<Box
					component={Link}
					to='/'
					sx={{
						display: 'flex',
						alignItems: 'center',
						gap: 1,
						minWidth: 0,
						textDecoration: 'none'
					}}
				>
					<Box
						sx={{
							width: 28,
							height: 28,
							borderRadius: `${tokens.radius.md}px`,
							backgroundColor: tokens.color.accent[500],
							color: tokens.color.accent.fg,
							display: 'inline-flex',
							alignItems: 'center',
							justifyContent: 'center',
							fontSize: 14,
							fontWeight: 'bold',
							letterSpacing: '-0.02em',
							flexShrink: 0
						}}
					>
						Q
					</Box>
					{!collapsed && (
						<Box
							component='span'
							sx={{
								fontFamily: tokens.font.display,
								fontSize: 22,
								fontWeight: 'medium',
								color: tokens.color.ink1,
								letterSpacing: '-0.01em',
								lineHeight: 1
							}}
						>
							Offertum
						</Box>
					)}
				</Box>
				{!collapsed && <NavToggle collapsed={collapsed} onToggle={onToggleCollapsed} />}
			</Box>

			{/* Primary nav */}
			<Box
				component='nav'
				sx={{
					flex: 1,
					px: 1,
					pt: 1,
					pb: 2,
					display: 'flex',
					flexDirection: 'column',
					gap: 0.25,
					overflowY: 'auto'
				}}
			>
				{collapsed && (
					<Box sx={{ display: 'flex', justifyContent: 'center', pb: 1 }}>
						<NavToggle collapsed={collapsed} onToggle={onToggleCollapsed} />
					</Box>
				)}
				{PRIMARY_NAV.map(entry => {
					const locked = Boolean(entry.gated) && !isEntitled;
					const isSettingsParent = entry.to === SETTINGS_PARENT_ROUTE;
					// The Instellingen parent stays active on ANY /settings subpage, not just /settings/email.
					const active = !locked && isActive(isSettingsParent ? '/settings' : entry.to);
					// Expand the settings children inline while on a settings route (design "Variant B").
					const showSettingsSub = isSettingsParent && !collapsed && isActive('/settings');
					return (
						<Fragment key={entry.to}>
							<NavItem entry={entry} active={active} collapsed={collapsed} locked={locked} />
							{showSettingsSub && (
								<SettingsSubNav pathname={pathname} isOwner={isOwner} isEntitled={isEntitled} />
							)}
						</Fragment>
					);
				})}

				{isAdmin && (
					<>
						<Overline
							sx={{
								display: 'block',
								px: collapsed ? 0 : 1.5,
								pt: 2.5,
								pb: 0.75,
								color: tokens.color.ink4,
								textAlign: collapsed ? 'center' : 'left'
							}}
						>
							{collapsed ? '—' : 'Admin'}
						</Overline>
						{ADMIN_NAV.map(entry => (
							<NavItem key={entry.to} entry={entry} active={isActive(entry.to)} collapsed={collapsed} />
						))}
					</>
				)}
			</Box>

			{/* Bottom block: org switcher + theme toggle + user menu */}
			<Box
				sx={{
					borderTop: `1px solid ${tokens.color.line}`,
					p: 1,
					display: 'flex',
					flexDirection: 'column',
					gap: 0.5,
					flexShrink: 0
				}}
			>
				<OrgSwitcher
					collapsed={collapsed}
					currentOrgId={me.organization.id}
					currentOrgName={me.organization.name}
				/>
				<ThemeToggle collapsed={collapsed} />
				<UserMenu collapsed={collapsed} name={me.user.name ?? me.user.email} email={me.user.email} />
			</Box>
		</Box>
	);
}

function NavToggle({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
	return (
		<Tooltip title={collapsed ? 'Uitvouwen' : 'Inklappen'} placement='right'>
			<IconButton
				onClick={onToggle}
				aria-label={collapsed ? 'Zijbalk uitvouwen' : 'Zijbalk inklappen'}
				sx={{
					width: 28,
					height: 28,
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
					background: 'transparent',
					border: 'none',
					color: 'text.disabled',
					cursor: 'pointer',
					borderRadius: 1,
					'&:hover': { color: 'text.secondary', backgroundColor: 'action.hover' }
				}}
			>
				<AppIcon name={collapsed ? 'chevron-right' : 'chevron-left'} size='medium' />
			</IconButton>
		</Tooltip>
	);
}

function NavItem({
	entry,
	active,
	collapsed,
	locked = false
}: {
	entry: NavEntry;
	active: boolean;
	collapsed: boolean;
	locked?: boolean;
}) {
	const { tokens } = useTheme();
	// A locked (entitlement-gated) item routes to /billing — the "you hit a wall" landing —
	// instead of its own destination, and is never shown as the active page.
	const to = locked ? BILLING_ROUTE : entry.to;
	const item = (
		<Box
			component={Link}
			to={to}
			aria-current={active ? 'page' : undefined}
			aria-label={locked ? `${entry.label} — vergrendeld, ga naar Abonnement` : undefined}
			sx={{
				position: 'relative',
				display: 'flex',
				alignItems: 'center',
				gap: 1.25,
				px: collapsed ? 0 : 1.5,
				py: collapsed ? 1.25 : 1,
				justifyContent: collapsed ? 'center' : 'flex-start',
				textDecoration: 'none',
				borderRadius: `${tokens.radius.md}px`,
				fontSize: 13,
				fontWeight: active ? 600 : 500,
				color: active ? tokens.color.accent[700] : tokens.color.ink3,
				backgroundColor: active ? tokens.color.accent[50] : 'transparent',
				transition: `background ${tokens.motion.durBase}ms ${tokens.motion.easeOut}, color ${tokens.motion.durBase}ms ${tokens.motion.easeOut}`,
				'&:hover': active ? {} : { backgroundColor: tokens.color.paper3, color: tokens.color.ink1 }
			}}
		>
			{/* Left accent bar for the active item */}
			<Box
				aria-hidden='true'
				sx={{
					position: 'absolute',
					left: collapsed ? 4 : -1,
					top: '50%',
					width: 3,
					height: active ? 18 : 0,
					backgroundColor: tokens.color.accent[500],
					borderRadius: '2px',
					transform: 'translateY(-50%)',
					opacity: active ? 1 : 0,
					transition: `height ${tokens.motion.durBase}ms ${tokens.motion.easeOut}, opacity ${tokens.motion.durBase}ms ${tokens.motion.easeOut}`
				}}
			/>
			<AppIcon name={entry.icon} size='medium' filled={active} />
			{!collapsed && (
				<Box
					component='span'
					sx={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
				>
					{entry.label}
				</Box>
			)}
			{/* Premium padlock — expanded: trailing icon; collapsed: small corner badge. */}
			{!collapsed && locked && (
				<Box
					component='span'
					aria-hidden='true'
					sx={{ display: 'inline-flex', flexShrink: 0, color: tokens.color.ink4 }}
				>
					<AppIcon name='lock' size='small' />
				</Box>
			)}
			{collapsed && locked && (
				<Box
					component='span'
					aria-hidden='true'
					sx={{ position: 'absolute', bottom: 5, right: 8, display: 'inline-flex', color: tokens.color.ink4 }}
				>
					<AppIcon name='lock' size='small' />
				</Box>
			)}
		</Box>
	);

	// Locked items append a "(vergrendeld)" hint to the collapsed-mode tooltip so the padlock
	// isn't the only signal.
	const tooltipLabel = locked ? `${entry.label} (vergrendeld)` : entry.label;

	return collapsed ? (
		<Tooltip title={tooltipLabel} placement='right'>
			{item}
		</Tooltip>
	) : (
		item
	);
}

/**
 * Inline settings sub-navigation (design "Variant B"). Rendered beneath the "Instellingen" item
 * while on any settings route (expanded sidebar only) — replaces the old horizontal settings tab
 * bar. A guide line links the children to the parent; owner-only pages are hidden for members and
 * subscription-gated pages show a padlock (the page itself hosts the upsell).
 */
function SettingsSubNav({
	pathname,
	isOwner,
	isEntitled
}: {
	pathname: string;
	isOwner: boolean;
	isEntitled: boolean;
}) {
	const { tokens } = useTheme();
	const items = SETTINGS_SUB_NAV.filter(item => isOwner || !item.ownerOnly);
	// Bare `/settings` (no subpage) resolves to the first child, matching the parent's destination.
	const activePath = pathname === '/settings' ? SETTINGS_PARENT_ROUTE : pathname;

	return (
		<Box
			sx={{
				position: 'relative',
				display: 'flex',
				flexDirection: 'column',
				gap: 0.25,
				mt: 0.25,
				mb: 0.75,
				'@keyframes settingsSubFade': {
					from: { opacity: 0, transform: 'translateY(-4px)' },
					to: { opacity: 1, transform: 'translateY(0)' }
				},
				animation: `settingsSubFade ${tokens.motion.durBase}ms ${tokens.motion.easeOut}`
			}}
		>
			{/* Guide line linking the children to the parent item. */}
			<Box
				aria-hidden='true'
				sx={{
					position: 'absolute',
					left: 21,
					top: 3,
					bottom: 3,
					width: '1px',
					backgroundColor: tokens.color.line
				}}
			/>
			{items.map(item => (
				<SettingsSubItem
					key={item.to}
					item={item}
					active={activePath.startsWith(item.to)}
					locked={item.lockedWhenNotEntitled && !isEntitled}
				/>
			))}
		</Box>
	);
}

function SettingsSubItem({ item, active, locked }: { item: SettingsSubEntry; active: boolean; locked: boolean }) {
	const { tokens } = useTheme();
	const c = tokens.color;
	return (
		<Box
			component={Link}
			to={item.to}
			aria-current={active ? 'page' : undefined}
			sx={{
				display: 'flex',
				alignItems: 'center',
				gap: 1,
				py: 0.75,
				pl: 5,
				pr: 1.5,
				textDecoration: 'none',
				borderRadius: `${tokens.radius.md}px`,
				fontSize: 12.5,
				fontWeight: active ? 600 : 500,
				color: active ? c.accent[700] : c.ink3,
				backgroundColor: active ? c.accent[50] : 'transparent',
				transition: `background ${tokens.motion.durBase}ms ${tokens.motion.easeOut}, color ${tokens.motion.durBase}ms ${tokens.motion.easeOut}`,
				'&:hover': active ? {} : { backgroundColor: c.paper3, color: c.ink1 }
			}}
		>
			<Box
				component='span'
				sx={{ display: 'inline-flex', flexShrink: 0, color: active ? c.accent[700] : c.ink4 }}
			>
				<AppIcon name={item.icon} size='small' />
			</Box>
			<Box component='span' sx={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
				{item.label}
			</Box>
			{locked && (
				<Box component='span' aria-hidden='true' sx={{ display: 'inline-flex', flexShrink: 0, color: c.ink4 }}>
					<AppIcon name='lock' size='small' />
				</Box>
			)}
		</Box>
	);
}

/**
 * Light/dark switch in the sidebar bottom block. Expanded: a two-segment toggle (Licht / Donker)
 * mirroring the design; collapsed: a single sun/moon icon button. State is owned by the root
 * `ThemeModeProvider` (persisted to localStorage + reflected on `document.documentElement`).
 */
function ThemeToggle({ collapsed }: { collapsed: boolean }) {
	const { tokens } = useTheme();
	const { mode, setMode, toggleMode } = useThemeMode();
	const isDark = mode === 'dark';

	if (collapsed) {
		return (
			<Tooltip title={isDark ? 'Lichte modus' : 'Donkere modus'} placement='right'>
				<IconButton
					onClick={toggleMode}
					aria-label={isDark ? 'Schakel naar lichte modus' : 'Schakel naar donkere modus'}
					sx={{
						width: 40,
						height: 36,
						alignSelf: 'center',
						display: 'inline-flex',
						alignItems: 'center',
						justifyContent: 'center',
						background: 'transparent',
						border: `1px solid ${tokens.color.line}`,
						borderRadius: `${tokens.radius.md}px`,
						cursor: 'pointer',
						color: tokens.color.ink2,
						'&:hover': { backgroundColor: tokens.color.paper3 }
					}}
				>
					<AppIcon name={isDark ? 'sun' : 'moon'} size='medium' />
				</IconButton>
			</Tooltip>
		);
	}

	const options: { id: ThemeMode; label: string; icon: AppIconName }[] = [
		{ id: 'light', label: 'Licht', icon: 'sun' },
		{ id: 'dark', label: 'Donker', icon: 'moon' }
	];

	return (
		<Box
			role='group'
			aria-label='Thema'
			sx={{
				display: 'flex',
				gap: 0.5,
				p: 0.5,
				backgroundColor: tokens.color.surface,
				border: `1px solid ${tokens.color.line}`,
				borderRadius: `${tokens.radius.md}px`
			}}
		>
			{options.map(option => {
				const active = mode === option.id;
				return (
					<ButtonBase
						key={option.id}
						onClick={() => setMode(option.id)}
						aria-pressed={active}
						sx={{
							flex: 1,
							display: 'inline-flex',
							alignItems: 'center',
							justifyContent: 'center',
							gap: 0.75,
							py: 0.75,
							px: 1,
							fontFamily: tokens.font.sans,
							fontSize: 12,
							fontWeight: active ? 'bold' : 'medium',
							cursor: 'pointer',
							borderRadius: `${tokens.radius.sm}px`,
							backgroundColor: active ? tokens.color.accent[50] : 'transparent',
							border: `1px solid ${active ? tokens.color.accent[200] : 'transparent'}`,
							color: active ? tokens.color.accent[700] : tokens.color.ink3,
							transition: `background ${tokens.motion.durFast}ms ${tokens.motion.easeOut}, color ${tokens.motion.durFast}ms ${tokens.motion.easeOut}`,
							'&:hover': active ? {} : { color: tokens.color.ink1 }
						}}
					>
						<AppIcon name={option.icon} size='small' filled={active} />
						{option.label}
					</ButtonBase>
				);
			})}
		</Box>
	);
}

function OrgSwitcher({
	collapsed,
	currentOrgId,
	currentOrgName
}: {
	collapsed: boolean;
	currentOrgId: string;
	currentOrgName: string;
}) {
	const { tokens } = useTheme();
	const { data: organizations } = useSuspenseQuery(myOrganizationsQueryOptions);
	const switchOrg = useSwitchOrganization();
	const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
	const initial = (currentOrgName || '?').charAt(0).toUpperCase();

	const onSelect = (organizationId: string, isCurrent: boolean): void => {
		setAnchorEl(null);
		if (!isCurrent) {
			switchOrg.mutate(organizationId);
		}
	};

	return (
		<>
			<ButtonBase
				onClick={(e: MouseEvent<HTMLButtonElement>) => setAnchorEl(e.currentTarget)}
				title={collapsed ? currentOrgName : undefined}
				sx={{
					display: 'flex',
					alignItems: 'center',
					gap: 1.25,
					width: collapsed ? 40 : '100%',
					height: 36,
					alignSelf: 'center',
					px: collapsed ? 0 : 1.25,
					justifyContent: collapsed ? 'center' : 'flex-start',
					backgroundColor: 'background.paper',
					border: `1px solid ${tokens.color.line}`,
					borderRadius: `${tokens.radius.md}px`,
					cursor: 'pointer',
					color: 'text.primary',
					textAlign: 'left'
				}}
			>
				<Box
					sx={{
						width: 22,
						height: 22,
						borderRadius: '5px',
						backgroundColor: tokens.color.accent[50],
						color: tokens.color.accent[700],
						display: 'inline-flex',
						alignItems: 'center',
						justifyContent: 'center',
						fontSize: 11,
						fontWeight: 'bold',
						flexShrink: 0
					}}
				>
					{initial}
				</Box>
				{!collapsed && (
					<>
						<Box
							component='span'
							sx={{
								flex: 1,
								fontSize: 13,
								fontWeight: 'medium',
								whiteSpace: 'nowrap',
								overflow: 'hidden',
								textOverflow: 'ellipsis'
							}}
						>
							{currentOrgName}
						</Box>
						<AppIcon name='chevrons-up-down' size='small' style={{ color: tokens.color.ink4 }} />
					</>
				)}
			</ButtonBase>
			<Menu
				anchorEl={anchorEl}
				open={Boolean(anchorEl)}
				onClose={() => setAnchorEl(null)}
				anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
				transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
				slotProps={{ paper: { sx: { minWidth: 230, marginTop: -0.5, marginLeft: -1 } } }}
			>
				{organizations.map(membership => {
					const isCurrent = membership.organization.id === currentOrgId;
					return (
						<MenuItem
							key={membership.organization.id}
							selected={isCurrent}
							onClick={() => onSelect(membership.organization.id, isCurrent)}
						>
							<ListItemIcon sx={{ minWidth: 28 }}>
								{isCurrent && <AppIcon name='check' size='medium' />}
							</ListItemIcon>
							{membership.organization.name}
						</MenuItem>
					);
				})}
			</Menu>
		</>
	);
}

function UserMenu({ collapsed, name, email }: { collapsed: boolean; name: string; email: string }) {
	const { tokens } = useTheme();
	const navigate = useNavigate();
	const signOut = useSignOut();
	const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
	return (
		<>
			<ButtonBase
				onClick={(e: MouseEvent<HTMLButtonElement>) => setAnchorEl(e.currentTarget)}
				title={collapsed ? name : undefined}
				sx={{
					display: 'flex',
					alignItems: 'center',
					gap: 1.25,
					width: collapsed ? 40 : '100%',
					alignSelf: 'center',
					p: 0.75,
					justifyContent: collapsed ? 'center' : 'flex-start',
					background: 'transparent',
					border: 'none',
					borderRadius: `${tokens.radius.md}px`,
					cursor: 'pointer',
					textAlign: 'left',
					'&:hover': { backgroundColor: 'action.hover' }
				}}
			>
				<Avatar name={name} size={32} />
				{!collapsed && (
					<>
						<Box sx={{ flex: 1, minWidth: 0, lineHeight: 1.2 }}>
							<Box
								sx={{
									fontSize: 13,
									fontWeight: 'medium',
									color: 'text.primary',
									whiteSpace: 'nowrap',
									overflow: 'hidden',
									textOverflow: 'ellipsis'
								}}
							>
								{name}
							</Box>
							<Box
								sx={{
									fontSize: 11,
									color: 'text.disabled',
									whiteSpace: 'nowrap',
									overflow: 'hidden',
									textOverflow: 'ellipsis'
								}}
							>
								{email}
							</Box>
						</Box>
						<AppIcon name='chevron-down' size='small' style={{ color: tokens.color.ink4 }} />
					</>
				)}
			</ButtonBase>
			<Menu
				anchorEl={anchorEl}
				open={Boolean(anchorEl)}
				onClose={() => setAnchorEl(null)}
				anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
				transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
				slotProps={{ paper: { sx: { minWidth: 230, marginTop: -0.5, marginLeft: -1 } } }}
			>
				<MenuItem
					onClick={() => {
						setAnchorEl(null);
						void navigate({ to: '/settings/organization' });
					}}
				>
					<ListItemIcon sx={{ minWidth: 28 }}>
						<AppIcon name='user' size='medium' />
					</ListItemIcon>
					Profiel
				</MenuItem>
				<MenuItem
					onClick={() => {
						setAnchorEl(null);
						void navigate({ to: '/settings/writing-style' });
					}}
				>
					<ListItemIcon sx={{ minWidth: 28 }}>
						<AppIcon name='pen-line' size='medium' />
					</ListItemIcon>
					Schrijfstijl
				</MenuItem>
				<Divider />
				<MenuItem
					disabled={signOut.isPending}
					onClick={() => {
						setAnchorEl(null);
						signOut.mutate();
					}}
				>
					<ListItemIcon sx={{ minWidth: 28 }}>
						<AppIcon name='log-out' size='medium' />
					</ListItemIcon>
					Uitloggen
				</MenuItem>
			</Menu>
		</>
	);
}

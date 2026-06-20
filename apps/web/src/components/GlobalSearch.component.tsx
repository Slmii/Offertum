import { AppIcon, type AppIconName } from '@/components/AppIcon.component';
import { BodySmall, Overline } from '@/components/Text.component';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { opportunitiesListQueryOptions } from '@/lib/queries/opportunities.queries';
import { myMembershipQueryOptions } from '@/lib/queries/team.queries';
import {
	OPPORTUNITY_STATUS_CHIP_COLORS,
	OPPORTUNITY_STATUS_LABELS_NL,
	OPPORTUNITY_URGENCY_COLORS,
	opportunityCustomerLabel
} from '@/lib/utils/opportunity.utils';
import type { tokens as designTokens } from '@/lib/utils/theme.utils';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import { useTheme } from '@mui/material/styles';
import type { Opportunity } from '@offertum/shared';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

type NavRoute =
	| '/opportunities'
	| '/calendar'
	| '/team'
	| '/billing'
	| '/settings/email'
	| '/settings/writing-style'
	| '/settings/business-details'
	| '/settings/catalog'
	| '/settings/pricing-playbook'
	| '/settings/follow-ups'
	| '/settings/notifications'
	| '/settings/calendar'
	| '/settings/integrations';

interface NavShortcut {
	to: NavRoute;
	label: string;
	hint: string;
	icon: AppIconName;
	keywords: string;
	ownerOnly: boolean;
}

const NAV_SHORTCUTS: NavShortcut[] = [
	{
		to: '/opportunities',
		label: 'Offerteaanvragen',
		hint: 'Inbox en concepten',
		icon: 'inbox',
		keywords: 'inbox aanvragen offertes',
		ownerOnly: false
	},
	{
		to: '/calendar',
		label: 'Kalender',
		hint: 'Deadlines en afspraken',
		icon: 'calendar',
		keywords: 'agenda kalender deadlines',
		ownerOnly: false
	},
	{
		to: '/team',
		label: 'Team',
		hint: 'Leden en uitnodigingen',
		icon: 'users',
		keywords: 'team leden uitnodigen rollen',
		ownerOnly: false
	},
	{
		to: '/billing',
		label: 'Abonnement',
		hint: 'Plan en facturering',
		icon: 'credit-card',
		keywords: 'abonnement facturering billing plan',
		ownerOnly: false
	},
	{
		to: '/settings/email',
		label: 'E-mailaccounts',
		hint: 'Gmail- en Outlook-koppelingen',
		icon: 'settings',
		keywords: 'email gmail outlook mailbox',
		ownerOnly: false
	},
	{
		to: '/settings/writing-style',
		label: 'Schrijfstijl',
		hint: 'Hoe de AI in jouw stem schrijft',
		icon: 'pen-line',
		keywords: 'schrijfstijl toon stem playbook',
		ownerOnly: false
	},
	{
		to: '/settings/business-details',
		label: 'Bedrijfsgegevens',
		hint: 'KvK, adres, logo',
		icon: 'settings',
		keywords: 'bedrijf organisatie kvk adres logo',
		ownerOnly: false
	},
	{
		to: '/settings/notifications',
		label: 'Notificaties',
		hint: 'E-mail- en in-app-meldingen',
		icon: 'settings',
		keywords: 'notificaties meldingen',
		ownerOnly: false
	},
	{
		to: '/settings/calendar',
		label: 'Agenda-synchronisatie',
		hint: 'iCal-feed voor je telefoon',
		icon: 'calendar',
		keywords: 'agenda sync ical abonnement',
		ownerOnly: false
	},
	{
		to: '/settings/catalog',
		label: 'Catalogus',
		hint: 'Producten en standaardprijzen',
		icon: 'package',
		keywords: 'catalogus producten prijzen',
		ownerOnly: true
	},
	{
		to: '/settings/pricing-playbook',
		label: 'Prijsregels',
		hint: 'Tarieven, opslagen, BTW',
		icon: 'settings',
		keywords: 'prijsregels tarieven btw playbook',
		ownerOnly: true
	},
	{
		to: '/settings/follow-ups',
		label: 'Follow-ups',
		hint: 'Cadens en max pogingen',
		icon: 'settings',
		keywords: 'follow-ups herinneringen cadens',
		ownerOnly: true
	},
	{
		to: '/settings/integrations',
		label: 'Integraties',
		hint: 'Boekhouding, ERP, iPaaS',
		icon: 'link',
		keywords: 'integraties moneybird netsuite boekhouding',
		ownerOnly: false
	}
];

/** Flat selectable entry — drives keyboard arrow navigation across all groups. */
interface FlatResult {
	key: string;
	run: () => void;
}

/**
 * Global search in the top bar (⌘K) — ported from the design's `GlobalSearch`. Searches real
 * opportunities via the existing list endpoint (debounced) and offers role-aware navigation
 * shortcuts. The design's separate "people" group folds into opportunity results (each row
 * already shows the customer); the "AI-zoek" footnote is aspirational. Before typing the
 * dropdown shows a "Recent geopend" state with the most recent active opportunities.
 */
export function GlobalSearch() {
	const { tokens } = useTheme();
	const navigate = useNavigate();
	const { data: me } = useSuspenseQuery(myMembershipQueryOptions);
	const isOwner = me.role === 'OWNER';

	const [query, setQuery] = useState('');
	const [open, setOpen] = useState(false);
	const [activeIndex, setActiveIndex] = useState(0);
	const debounced = useDebouncedValue(query.trim(), 250);
	const containerRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	const lowQuery = debounced.toLowerCase();
	const hasQuery = debounced.length >= 2;

	// Opportunity search hits the list endpoint with the term (active opps only). `useQuery`
	// (not the loader/Suspense pattern) is correct here — this is an on-demand, type-to-search
	// interaction, not route data.
	const { data: searchData, isFetching } = useQuery({
		...opportunitiesListQueryOptions(null, debounced || null, 'active'),
		enabled: hasQuery
	});
	// "Recent geopend" default state — most recent active opportunities, fetched once the
	// dropdown opens and re-used while the user hasn't typed a 2+ char query yet.
	const { data: recentData } = useQuery({
		...opportunitiesListQueryOptions(null, null, 'active'),
		enabled: open && !hasQuery
	});

	const opResults = hasQuery ? (searchData?.opportunities ?? []).slice(0, 6) : [];
	const recentResults = !hasQuery ? (recentData?.opportunities ?? []).slice(0, 4) : [];

	const navResults = useMemo(() => {
		if (!hasQuery) {
			return [];
		}
		return NAV_SHORTCUTS.filter(
			s =>
				(isOwner || !s.ownerOnly) && (s.label.toLowerCase().includes(lowQuery) || s.keywords.includes(lowQuery))
		).slice(0, 5);
	}, [hasQuery, lowQuery, isOwner]);

	const select = (run: () => void): void => {
		run();
		setQuery('');
		setOpen(false);
		inputRef.current?.blur();
	};

	// Flat list of every selectable row, in render order, for keyboard navigation.
	const flatResults: FlatResult[] = useMemo(() => {
		const rows: FlatResult[] = [];
		const opps = hasQuery ? opResults : recentResults;
		for (const op of opps) {
			rows.push({ key: `op-${op.id}`, run: () => navigate({ to: '/opportunities/$id', params: { id: op.id } }) });
		}
		for (const shortcut of navResults) {
			rows.push({ key: `nav-${shortcut.to}`, run: () => navigate({ to: shortcut.to }) });
		}
		return rows;
		// navigate is stable; opResults/recentResults/navResults capture the data.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [hasQuery, opResults, recentResults, navResults]);

	// Clamp the highlighted row to the current result set — when results shrink (or the query
	// changes) a previously-stored index can fall out of range; deriving it at render avoids a
	// reset-in-effect cascade.
	const safeActiveIndex = flatResults.length === 0 ? -1 : Math.min(activeIndex, flatResults.length - 1);

	// ⌘/Ctrl+K focuses the search; Esc blurs it. Arrow keys + Enter drive selection.
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
				e.preventDefault();
				inputRef.current?.focus();
			} else if (e.key === 'Escape') {
				inputRef.current?.blur();
				setOpen(false);
			}
		};
		document.addEventListener('keydown', onKey);
		return () => document.removeEventListener('keydown', onKey);
	}, []);

	// Close on outside click.
	useEffect(() => {
		if (!open) {
			return;
		}
		const onDown = (e: MouseEvent) => {
			if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
				setOpen(false);
			}
		};
		document.addEventListener('mousedown', onDown);
		return () => document.removeEventListener('mousedown', onDown);
	}, [open]);

	const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
		if (!open || flatResults.length === 0) {
			return;
		}
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			setActiveIndex((safeActiveIndex + 1) % flatResults.length);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			setActiveIndex((safeActiveIndex - 1 + flatResults.length) % flatResults.length);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			const active = flatResults[safeActiveIndex];
			if (active) {
				select(active.run);
			}
		}
	};

	const clear = (): void => {
		setQuery('');
		inputRef.current?.focus();
	};

	const showResults = open && (hasQuery || recentResults.length > 0);
	const noResults = showResults && hasQuery && !isFetching && opResults.length === 0 && navResults.length === 0;

	return (
		<Box ref={containerRef} sx={{ position: 'relative', width: '100%' }}>
			<Box
				onClick={() => inputRef.current?.focus()}
				sx={{
					display: 'flex',
					alignItems: 'center',
					gap: 1,
					height: 36,
					px: 1.5,
					backgroundColor: open ? 'background.paper' : tokens.color.paper2,
					border: `1px solid ${open ? tokens.color.accent[500] : tokens.color.line}`,
					borderRadius: `${tokens.radius.md}px`,
					boxShadow: open ? tokens.focusRing : 'none',
					cursor: 'text',
					transition: 'border-color 120ms, box-shadow 120ms'
				}}
			>
				<AppIcon name='search' size='small' style={{ color: open ? tokens.color.ink2 : tokens.color.ink4 }} />
				<input
					ref={inputRef}
					value={query}
					onChange={e => {
						setQuery(e.target.value);
						setActiveIndex(0);
						setOpen(true);
					}}
					onFocus={() => setOpen(true)}
					onKeyDown={onInputKeyDown}
					placeholder='Zoek klant, aanvraag, adres of instelling…'
					style={{
						flex: 1,
						minWidth: 0,
						border: 'none',
						outline: 'none',
						background: 'transparent',
						fontSize: 13,
						fontFamily: tokens.font.sans,
						color: tokens.color.ink2,
						padding: 0
					}}
				/>
				{query && (
					<Box
						component='button'
						type='button'
						aria-label='Wis zoekopdracht'
						onClick={e => {
							e.stopPropagation();
							clear();
						}}
						sx={{
							width: 18,
							height: 18,
							p: 0,
							border: 'none',
							background: 'transparent',
							color: tokens.color.ink4,
							cursor: 'pointer',
							display: 'inline-flex',
							alignItems: 'center',
							justifyContent: 'center',
							borderRadius: '4px',
							flexShrink: 0,
							'&:hover': { color: tokens.color.ink2, backgroundColor: tokens.color.paper3 }
						}}
					>
						<AppIcon name='x' size='small' />
					</Box>
				)}
				<Box
					component='kbd'
					sx={{
						fontFamily: tokens.font.mono,
						fontSize: 11,
						color: tokens.color.ink4,
						px: 0.625,
						py: '1px',
						backgroundColor: 'background.paper',
						border: `1px solid ${tokens.color.line}`,
						borderRadius: '3px',
						lineHeight: 1.3,
						opacity: query ? 0 : 1,
						transition: 'opacity 120ms'
					}}
				>
					⌘K
				</Box>
			</Box>

			{showResults && (
				<Paper
					sx={{
						position: 'absolute',
						top: 'calc(100% + 6px)',
						left: 0,
						right: 0,
						zIndex: 60,
						maxHeight: 'min(560px, calc(100vh - 100px))',
						display: 'flex',
						flexDirection: 'column',
						boxShadow: tokens.shadow[2]
					}}
				>
					<Box sx={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
						{isFetching && opResults.length === 0 && hasQuery && (
							<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 3 }}>
								<CircularProgress size={18} />
							</Box>
						)}

						{!hasQuery && recentResults.length > 0 && (
							<>
								<SearchSectionHeader label='Recent geopend' />
								{recentResults.map((op, i) => (
									<OpportunityRow
										key={op.id}
										op={op}
										query={lowQuery}
										active={safeActiveIndex === i}
										onHover={() => setActiveIndex(i)}
										onClick={() =>
											select(() => navigate({ to: '/opportunities/$id', params: { id: op.id } }))
										}
									/>
								))}
							</>
						)}

						{opResults.length > 0 && (
							<>
								<SearchSectionHeader label='Offerteaanvragen' count={opResults.length} />
								{opResults.map((op, i) => (
									<OpportunityRow
										key={op.id}
										op={op}
										query={lowQuery}
										active={safeActiveIndex === i}
										onHover={() => setActiveIndex(i)}
										onClick={() =>
											select(() => navigate({ to: '/opportunities/$id', params: { id: op.id } }))
										}
									/>
								))}
							</>
						)}

						{navResults.length > 0 && (
							<>
								<SearchSectionHeader label='Instellingen & navigatie' count={navResults.length} />
								{navResults.map((shortcut, i) => {
									const flatIndex = opResults.length + i;
									return (
										<NavRow
											key={shortcut.to}
											shortcut={shortcut}
											query={lowQuery}
											active={safeActiveIndex === flatIndex}
											onHover={() => setActiveIndex(flatIndex)}
											onClick={() => select(() => navigate({ to: shortcut.to }))}
										/>
									);
								})}
							</>
						)}

						{noResults && (
							<Box sx={{ px: 2, py: 3.5, textAlign: 'center' }}>
								<Box
									sx={{
										width: 36,
										height: 36,
										mx: 'auto',
										mb: 1,
										borderRadius: '50%',
										backgroundColor: tokens.color.paper2,
										color: tokens.color.ink4,
										display: 'inline-flex',
										alignItems: 'center',
										justifyContent: 'center'
									}}
								>
									<AppIcon name='search-off' size='medium' />
								</Box>
								<BodySmall fontWeight='medium' sx={{ display: 'block' }}>
									Niks gevonden voor "{debounced}"
								</BodySmall>
								<BodySmall color='text.secondary' sx={{ display: 'block', mt: 0.25 }}>
									Probeer een ander zoekwoord, of zoek op klantnaam of adres.
								</BodySmall>
							</Box>
						)}
					</Box>

					<SearchFooterHints />
				</Paper>
			)}
		</Box>
	);
}

function SearchFooterHints() {
	const { tokens } = useTheme();
	return (
		<Box
			sx={{
				flexShrink: 0,
				px: 1.5,
				py: 1,
				backgroundColor: tokens.color.paper2,
				borderTop: `1px solid ${tokens.color.line}`,
				display: 'flex',
				alignItems: 'center',
				gap: 1.75,
				fontSize: 11,
				color: tokens.color.ink4,
				fontFamily: tokens.font.sans
			}}
		>
			<Box component='span' sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.625 }}>
				<SearchKbd>↑</SearchKbd>
				<SearchKbd>↓</SearchKbd>
				navigeer
			</Box>
			<Box component='span' sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.625 }}>
				<SearchKbd>↵</SearchKbd>
				open
			</Box>
			<Box component='span' sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.625 }}>
				<SearchKbd>esc</SearchKbd>
				sluit
			</Box>
			<Box component='span' sx={{ ml: 'auto', display: 'inline-flex', alignItems: 'center', gap: 0.625 }}>
				<AppIcon name='sparkles' size='small' />
				AI-zoek komt eraan
			</Box>
		</Box>
	);
}

function SearchKbd({ children }: { children: ReactNode }) {
	const { tokens } = useTheme();
	return (
		<Box
			component='kbd'
			sx={{
				fontFamily: tokens.font.mono,
				fontSize: 10,
				color: tokens.color.ink3,
				px: 0.5,
				backgroundColor: 'background.paper',
				border: `1px solid ${tokens.color.line}`,
				borderRadius: '3px',
				lineHeight: 1.4,
				minWidth: 14,
				textAlign: 'center',
				display: 'inline-block'
			}}
		>
			{children}
		</Box>
	);
}

/**
 * Wraps the first case-insensitive occurrence of `query` in a colored <mark> — ported from the
 * design's `highlightText`. Returns the raw text untouched when there's no query / no match.
 */
function highlightMatch(text: string, query: string, tokens: typeof designTokens): ReactNode {
	if (!query || !text) {
		return text;
	}
	const idx = text.toLowerCase().indexOf(query);
	if (idx === -1) {
		return text;
	}
	return (
		<>
			{text.slice(0, idx)}
			<Box
				component='mark'
				sx={{
					backgroundColor: tokens.color.accent[100],
					color: tokens.color.accent[700],
					p: 0,
					borderRadius: '2px',
					fontWeight: 'bold'
				}}
			>
				{text.slice(idx, idx + query.length)}
			</Box>
			{text.slice(idx + query.length)}
		</>
	);
}

function SearchSectionHeader({ label, count }: { label: string; count?: number }) {
	const { tokens } = useTheme();
	return (
		<Box
			sx={{
				px: 1.75,
				pt: 1.25,
				pb: 0.75,
				display: 'flex',
				alignItems: 'baseline',
				justifyContent: 'space-between',
				borderTop: `1px solid ${tokens.color.line}`,
				'&:first-of-type': { borderTop: 'none' }
			}}
		>
			<Overline color='text.disabled'>{label}</Overline>
			{count != null && <BodySmall color='text.disabled'>{count}</BodySmall>}
		</Box>
	);
}

function OpportunityRow({
	op,
	query,
	active,
	onHover,
	onClick
}: {
	op: Opportunity;
	query: string;
	active: boolean;
	onHover: () => void;
	onClick: () => void;
}) {
	const { tokens } = useTheme();
	const chip = OPPORTUNITY_STATUS_CHIP_COLORS[op.status];
	return (
		<Box
			component='button'
			type='button'
			onClick={onClick}
			onMouseEnter={onHover}
			sx={{
				display: 'flex',
				alignItems: 'center',
				gap: 1.5,
				width: '100%',
				px: 1.75,
				py: 1.25,
				background: active ? tokens.color.paper2 : 'transparent',
				border: 'none',
				cursor: 'pointer',
				textAlign: 'left',
				'&:hover': { backgroundColor: tokens.color.paper2 }
			}}
		>
			<Box
				sx={{
					width: 8,
					height: 8,
					borderRadius: '50%',
					backgroundColor: OPPORTUNITY_URGENCY_COLORS[op.urgency],
					flexShrink: 0
				}}
			/>
			<Box sx={{ flex: 1, minWidth: 0 }}>
				<BodySmall
					fontWeight='medium'
					sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
				>
					{highlightMatch(opportunityCustomerLabel(op), query, tokens)} ·{' '}
					{highlightMatch(op.requestType, query, tokens)}
				</BodySmall>
				{op.address && (
					<BodySmall
						color='text.secondary'
						sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
					>
						{highlightMatch(op.address, query, tokens)}
					</BodySmall>
				)}
			</Box>
			<Box
				component='span'
				sx={{
					flexShrink: 0,
					px: 1,
					py: '2px',
					borderRadius: '999px',
					backgroundColor: chip.bg,
					color: chip.fg,
					fontSize: '0.7rem',
					fontWeight: 'medium',
					whiteSpace: 'nowrap'
				}}
			>
				{OPPORTUNITY_STATUS_LABELS_NL[op.status]}
			</Box>
		</Box>
	);
}

function NavRow({
	shortcut,
	query,
	active,
	onHover,
	onClick
}: {
	shortcut: NavShortcut;
	query: string;
	active: boolean;
	onHover: () => void;
	onClick: () => void;
}) {
	const { tokens } = useTheme();
	return (
		<Box
			component='button'
			type='button'
			onClick={onClick}
			onMouseEnter={onHover}
			sx={{
				display: 'flex',
				alignItems: 'center',
				gap: 1.5,
				width: '100%',
				px: 1.75,
				py: 1.25,
				background: active ? tokens.color.paper2 : 'transparent',
				border: 'none',
				cursor: 'pointer',
				textAlign: 'left',
				'&:hover': { backgroundColor: tokens.color.paper2 }
			}}
		>
			<Box
				sx={{
					width: 28,
					height: 28,
					borderRadius: `${tokens.radius.sm}px`,
					backgroundColor: tokens.color.paper2,
					border: `1px solid ${tokens.color.line}`,
					color: tokens.color.ink3,
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
					flexShrink: 0
				}}
			>
				<AppIcon name={shortcut.icon} size='small' />
			</Box>
			<Box sx={{ flex: 1, minWidth: 0 }}>
				<BodySmall fontWeight='medium'>{highlightMatch(shortcut.label, query, tokens)}</BodySmall>
				<BodySmall color='text.secondary'>{shortcut.hint}</BodySmall>
			</Box>
			<AppIcon name='arrow-up-right' size='small' style={{ color: tokens.color.ink4 }} />
		</Box>
	);
}

import { AppIcon, type AppIconName } from '@/components/AppIcon.component';
import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import MuiTabs from '@mui/material/Tabs';
import { useTheme, type Theme } from '@mui/material/styles';
import type { ReactNode } from 'react';

/**
 * DRY tab control — ported from the design system's `Tabs`, built on MUI `Tabs`/`Tab` so it
 * gets roving-tabindex keyboard nav + ARIA + scroll handling for free. Four variants:
 *  - `underline` (default): page-level navigation with count badges (accent-100/paper-3).
 *  - `segmented`: pill switch inside a card/panel.
 *  - `chip`: multi-facet filter row.
 *  - `vertical`: settings / side-panel nav.
 *
 * Only `underline` keeps MUI's sliding indicator; the others hide it and style the selected
 * Tab directly. Token-driven so it needs no per-call styling. Generic over the option id `T`.
 */
export interface TabItem<T extends string> {
	id: T;
	label: ReactNode;
	icon?: AppIconName;
	count?: number;
	disabled?: boolean;
}

interface TabsProps<T extends string> {
	items: TabItem<T>[];
	value: T;
	onChange: (id: T) => void;
	variant?: 'underline' | 'segmented' | 'chip' | 'vertical';
}

export function Tabs<T extends string>({ items, value, onChange, variant = 'underline' }: TabsProps<T>) {
	const { tokens } = useTheme();
	// MUI warns if `value` matches no Tab; pass `false` (= nothing selected) for that case.
	const selected = items.some(item => item.id === value) ? value : false;

	return (
		<MuiTabs
			value={selected}
			onChange={(_event, next: T) => onChange(next)}
			orientation={variant === 'vertical' ? 'vertical' : 'horizontal'}
			variant={variant === 'underline' ? 'scrollable' : 'standard'}
			scrollButtons={false}
			allowScrollButtonsMobile
			slotProps={{
				indicator: {
					sx:
						variant === 'underline'
							? { backgroundColor: tokens.color.accent[500], height: 2 }
							: { display: 'none' }
				}
			}}
			sx={containerSx(variant, tokens)}
		>
			{items.map(item => (
				<Tab
					key={item.id}
					value={item.id}
					disabled={item.disabled}
					disableRipple
					sx={tabSx(variant, item.id === value, tokens)}
					label={
						<Box
							component='span'
							sx={{
								display: 'inline-flex',
								alignItems: 'center',
								gap: 0.75,
								width: variant === 'vertical' ? '100%' : 'auto'
							}}
						>
							{item.icon && <AppIcon name={item.icon} size='small' />}
							<Box
								component='span'
								sx={variant === 'vertical' ? { flex: 1, textAlign: 'left' } : undefined}
							>
								{item.label}
							</Box>
							{item.count != null && (
								<Box component='span' sx={countSx(variant, item.id === value, tokens)}>
									{item.count}
								</Box>
							)}
						</Box>
					}
				/>
			))}
		</MuiTabs>
	);
}

type Variant = NonNullable<TabsProps<string>['variant']>;

function containerSx(variant: Variant, tokens: Theme['tokens']): object {
	const flex = '& .MuiTabs-flexContainer';
	switch (variant) {
		case 'segmented':
			return {
				minHeight: 0,
				width: 'fit-content',
				p: '3px',
				backgroundColor: tokens.color.paper2,
				border: `1px solid ${tokens.color.line}`,
				borderRadius: `${tokens.radius.md}px`,
				[flex]: { gap: '3px' }
			};
		case 'chip':
			return { minHeight: 0, [flex]: { gap: 0.75, flexWrap: 'wrap' } };
		case 'vertical':
			return { minHeight: 0, [flex]: { gap: '1px' } };
		default: // underline
			return { minHeight: 0, borderBottom: `1px solid ${tokens.color.line}` };
	}
}

function tabSx(variant: Variant, active: boolean, tokens: Theme['tokens']): object {
	const base = {
		minHeight: 0,
		minWidth: 0,
		textTransform: 'none' as const,
		transition: `color ${tokens.motion.durFast}ms, background ${tokens.motion.durFast}ms, border-color ${tokens.motion.durFast}ms`
	};
	switch (variant) {
		case 'segmented':
			return {
				...base,
				px: 1.5,
				py: 0.75,
				borderRadius: `${tokens.radius.sm}px`,
				fontSize: 12.5,
				fontWeight: active ? 'bold' : 'medium',
				color: active ? tokens.color.ink1 : tokens.color.ink3,
				backgroundColor: active ? tokens.color.surface : 'transparent',
				boxShadow: active ? tokens.shadow[1] : 'none',
				'&.Mui-selected': { color: tokens.color.ink1 },
				'&:hover': active ? {} : { color: tokens.color.ink1 }
			};
		case 'chip':
			return {
				...base,
				px: 1.25,
				py: 0.5,
				borderRadius: `${tokens.radius.full}px`,
				border: `1px solid ${active ? tokens.color.accent[500] : tokens.color.line}`,
				fontSize: 12,
				fontWeight: 'medium',
				color: active ? tokens.color.accent.fg : tokens.color.ink2,
				backgroundColor: active ? tokens.color.accent[500] : 'transparent',
				'&.Mui-selected': { color: tokens.color.accent.fg },
				'&:hover': active ? {} : { backgroundColor: tokens.color.paper2 }
			};
		case 'vertical':
			return {
				...base,
				px: 1.25,
				py: 1,
				borderRadius: `${tokens.radius.md}px`,
				fontSize: 13,
				fontWeight: active ? 'bold' : 'medium',
				color: active ? tokens.color.accent[700] : tokens.color.ink3,
				backgroundColor: active ? tokens.color.accent[50] : 'transparent',
				alignItems: 'stretch',
				'&.Mui-selected': { color: tokens.color.accent[700] },
				'&:hover': active ? {} : { backgroundColor: tokens.color.paper2, color: tokens.color.ink1 }
			};
		default: // underline
			return {
				...base,
				px: 1.75,
				py: 1.25,
				fontSize: 13,
				fontWeight: active ? 'bold' : 'medium',
				color: active ? tokens.color.accent[700] : tokens.color.ink3,
				'&.Mui-selected': { color: tokens.color.accent[700] },
				'&:hover': active ? {} : { color: tokens.color.ink1 }
			};
	}
}

function countSx(variant: Variant, active: boolean, tokens: Theme['tokens']): object {
	const tabularCount = { fontVariantNumeric: 'tabular-nums' };
	switch (variant) {
		case 'segmented':
			return tabularCount;
		case 'chip':
			return { fontSize: 11, opacity: 0.85, ...tabularCount };
		case 'vertical':
			return {
				ml: 'auto',
				fontSize: 11,
				color: active ? tokens.color.accent[600] : tokens.color.ink4,
				...tabularCount
			};
		default: // underline
			return {
				px: 0.75,
				py: '1px',
				borderRadius: `${tokens.radius.sm}px`,
				fontSize: 11,
				fontWeight: 'bold',
				backgroundColor: active ? tokens.color.accent[100] : tokens.color.paper3,
				color: active ? tokens.color.accent[700] : tokens.color.ink3,
				...tabularCount
			};
	}
}

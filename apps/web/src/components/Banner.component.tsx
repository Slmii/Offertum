import { AppIcon, type AppIconName } from '@/components/AppIcon.component';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import type { SxProps, Theme } from '@mui/material/styles';
import type { ReactNode } from 'react';

/**
 * Inline banner — ported from the design system's `Inline banners` (info / success / warning /
 * error; vibrant accents on indigo info). Thin wrapper around MUI `Alert` so all banners share
 * one styling source: the per-severity DS palette lives in the theme's `MuiAlert` overrides
 * (`theme.utils.ts`), this component just maps the tone, supplies the Tabler icon, and renders
 * the title/children/action. The single replacement for scattered MUI `Alert` usages.
 */
export type BannerTone = 'info' | 'success' | 'warning' | 'error';

interface BannerProps {
	tone?: BannerTone;
	title?: ReactNode;
	children?: ReactNode;
	// Trailing action (e.g. a Button or close IconButton). Sits at the top-end of the banner.
	action?: ReactNode;
	// Override the default per-tone icon, or set null to omit it.
	icon?: AppIconName | null;
	// Layout-only escape hatch (margins); visual styling stays in the theme.
	sx?: SxProps<Theme>;
}

const DEFAULT_ICON: Record<BannerTone, AppIconName> = {
	info: 'info',
	success: 'circle-check',
	warning: 'alert-triangle',
	error: 'alert-circle'
};

export function Banner({ tone = 'info', title, children, action, icon, sx }: BannerProps) {
	const iconName = icon === undefined ? DEFAULT_ICON[tone] : icon;

	return (
		<Alert
			severity={tone}
			variant='standard'
			icon={iconName ? <AppIcon name={iconName} size='medium' /> : false}
			action={action}
			sx={sx}
		>
			{title && <AlertTitle>{title}</AlertTitle>}
			{children}
		</Alert>
	);
}

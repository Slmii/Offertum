import { type AppIconName } from '@/components/AppIcon.component';
import { BannerStack, type BannerTone } from '@/components/BannerStack.component';
import type { SxProps, Theme } from '@mui/material/styles';
import type { ReactNode } from 'react';

/**
 * Inline banner — a single notice rendered as a one-item {@link BannerStack}. The framed,
 * icon-tiled BannerStack look is the app-wide default for banners, even when there's only one,
 * so every call site shares the same styling source. For multiple related notices, use
 * `BannerStack` directly to collapse them into one frame.
 */
export type { BannerTone };

interface BannerProps {
	tone?: BannerTone;
	title?: ReactNode;
	children?: ReactNode;
	// Trailing action (e.g. a Button or close IconButton).
	action?: ReactNode;
	// Override the default per-tone icon, or set null to omit it.
	icon?: AppIconName | null;
	// Layout-only escape hatch (margins); visual styling stays in BannerStack.
	sx?: SxProps<Theme>;
}

export function Banner({ tone = 'info', title, children, action, icon, sx }: BannerProps) {
	return <BannerStack sx={sx} banners={[{ tone, title, body: children, icon, action }]} />;
}

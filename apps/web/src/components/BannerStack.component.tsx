import { AppIcon, type AppIconName } from '@/components/AppIcon.component';
import { BodySmall } from '@/components/Text.component';
import Box from '@mui/material/Box';
import { useTheme, type SxProps, type Theme } from '@mui/material/styles';
import type { ReactNode } from 'react';

/**
 * BannerStack — the design-system default for inline banners (ported from `Offertum App.html`).
 * Renders one contiguous, radius-clipped frame whose rows sit flush, each with a tone-colored
 * icon tile, a bold lead, an em-dash, and a description (plus an optional trailing action). This
 * is the single banner surface across the app, used even for one notice.
 *
 * Each row keeps the per-tone palette of the old MUI `Alert` (info = indigo, success = green,
 * warning = amber, error = red) — bg, text, AND border. The border lives on the row (top/left/
 * right, plus bottom on the last row) rather than on the frame, so a mixed-tone stack shows the
 * correct border colour per row instead of one shared (and necessarily wrong) frame border.
 *
 * `Banner` (singular) is a thin wrapper that renders a one-item stack, so every call site
 * gets this styling for free.
 */
export type BannerTone = 'info' | 'success' | 'warning' | 'error';

export interface BannerStackItem {
	// Stable key when the list is conditional; falls back to the index.
	key?: string;
	tone?: BannerTone;
	title?: ReactNode;
	body?: ReactNode;
	// Override the per-tone icon, or `null` to omit the icon tile entirely.
	icon?: AppIconName | null;
	// Trailing action (e.g. a Button), vertically centered at the row end.
	action?: ReactNode;
}

interface BannerStackProps {
	banners: BannerStackItem[];
	// Layout-only escape hatch (margins) applied to the frame; visual styling stays here.
	sx?: SxProps<Theme>;
}

const DEFAULT_ICON: Record<BannerTone, AppIconName> = {
	info: 'info',
	success: 'circle-check',
	warning: 'alert-triangle',
	error: 'alert-circle'
};

export function BannerStack({ banners, sx }: BannerStackProps) {
	const { tokens } = useTheme();
	const c = tokens.color;

	if (banners.length === 0) {
		return null;
	}

	// Per-tone tint from the theme status tokens (50 = bg, 500 = border, 700 = text) — dark-mode
	// aware and the single source of truth, so no hardcoded hex here. info maps to the accent ramp.
	const tones: Record<BannerTone, { bg: string; border: string; fg: string }> = {
		info: { bg: c.accent[50], border: c.accent[300], fg: c.accent[700] },
		success: { bg: c.won[50], border: c.won[500], fg: c.won[700] },
		warning: { bg: c.pending[50], border: c.pending[500], fg: c.pending[700] },
		error: { bg: c.lost[50], border: c.lost[500], fg: c.lost[700] }
	};

	// One contiguous frame: rows sit flush, each carrying its OWN tone border. Dropping the bottom
	// border on every row but the last keeps row dividers a single 1px line (the next row's top),
	// so a mixed-tone stack shows the correct border per row instead of one shared frame border.
	// The first/last rows round their own outer corners (rather than relying on a container clip,
	// which leaves square border corners), so the frame's rounded edges render crisply.
	const radius = `${tokens.radius.md}px`;
	return (
		<Box sx={[{}, ...(Array.isArray(sx) ? sx : [sx])]}>
			{banners.map((banner, index) => {
				const tone = banner.tone ?? 'info';
				const t = tones[tone];
				const iconName = banner.icon === undefined ? DEFAULT_ICON[tone] : banner.icon;
				const isFirst = index === 0;
				const isLast = index === banners.length - 1;

				return (
					<Box
						key={banner.key ?? index}
						sx={{
							display: 'flex',
							alignItems: 'center',
							gap: 1.25,
							py: 1.25,
							px: 1.75,
							backgroundColor: t.bg,
							color: t.fg,
							border: `1px solid ${t.border}`,
							...(isLast ? {} : { borderBottom: 'none' }),
							borderTopLeftRadius: isFirst ? radius : 0,
							borderTopRightRadius: isFirst ? radius : 0,
							borderBottomLeftRadius: isLast ? radius : 0,
							borderBottomRightRadius: isLast ? radius : 0
						}}
					>
						{iconName && (
							<Box
								component='span'
								sx={{
									display: 'inline-flex',
									alignItems: 'center',
									justifyContent: 'center',
									flexShrink: 0,
									width: 22,
									height: 22,
									borderRadius: `${tokens.radius.sm}px`,
									backgroundColor: c.surface,
									border: `1px solid ${t.border}`,
									color: t.fg
								}}
							>
								<AppIcon name={iconName} size='small' />
							</Box>
						)}
						<BodySmall component='div' sx={{ flex: 1, minWidth: 0, color: t.fg, lineHeight: 1.45 }}>
							{banner.title ? (
								<>
									<Box component='strong' sx={{ fontWeight: 'bold' }}>
										{banner.title}
									</Box>
									{banner.body ? <Box component='span'> — {banner.body}</Box> : null}
								</>
							) : (
								banner.body
							)}
						</BodySmall>
						{banner.action && <Box sx={{ flexShrink: 0 }}>{banner.action}</Box>}
					</Box>
				);
			})}
		</Box>
	);
}

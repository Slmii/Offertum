import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';
import { useTheme } from '@mui/material/styles';
import type { ReactNode, RefObject } from 'react';

interface FixedPageLayoutProps {
	/** Fixed chrome above the scroll area (page header, tabs, filters, search, …). */
	header?: ReactNode;
	/** Scroll-area content. Anything that should scroll while `header` stays put. */
	children: ReactNode;
	/**
	 * Ref attached to the scroll container. Pass it when the body virtualizes against this
	 * region — create the ref in the page and give the SAME ref to the virtualizer
	 * (e.g. `InfiniteList`'s `scrollRef`). Omit for plain scrolling content.
	 */
	scrollRef?: RefObject<HTMLDivElement | null>;
	/**
	 * Vertical space the app shell occupies around the routed page, subtracted from the
	 * viewport so the page never triggers window scroll. Defaults to the sticky TopBar
	 * height + the AppShell `Container` vertical padding (`py: 6` = 96px).
	 */
	offsetPx?: number;
	/** Extra styling for the scroll area (e.g. padding). */
	bodySx?: SxProps<Theme>;
}

/**
 * Pins a page to the viewport so its chrome stays fixed and ONLY the body scrolls. Wrap any
 * page that wants a fixed header + a single internal scroll region (lists, long content):
 *
 * ```tsx
 * // plain scrolling content
 * <FixedPageLayout header={<PageHeader … />}>{longContent}</FixedPageLayout>
 *
 * // virtualized: share one ref between the layout and the virtualizer
 * const scrollRef = useRef<HTMLDivElement>(null);
 * <FixedPageLayout header={<PageHeader … />} scrollRef={scrollRef}>
 *   <InfiniteList scrollRef={scrollRef} … />
 * </FixedPageLayout>
 * ```
 *
 * The body is a bounded flex child (`flex: 1; minHeight: 0; overflowY: auto`); the header is
 * `flexShrink: 0`. Sized for routes rendered inside the AppShell `Container` — override
 * `offsetPx` for other contexts.
 */
export function FixedPageLayout({ header, children, scrollRef, offsetPx, bodySx }: FixedPageLayoutProps) {
	const { tokens } = useTheme();
	// AppShell `Container` uses `py: 6` (48px top + bottom = 96) below the sticky TopBar.
	const offset = offsetPx ?? tokens.layout.topbarHeight + 96;

	return (
		<Box sx={{ display: 'flex', flexDirection: 'column', height: `calc(100dvh - ${offset}px)` }}>
			{header && <Box sx={{ flexShrink: 0 }}>{header}</Box>}
			<Box
				ref={scrollRef}
				sx={[
					// `mx/px: 4px` keeps a focused row's outline from being clipped by the scroll edge.
					{ flex: 1, minHeight: 0, overflowY: 'auto', px: '4px', mx: '-4px' },
					...(Array.isArray(bodySx) ? bodySx : [bodySx])
				]}
			>
				{children}
			</Box>
		</Box>
	);
}

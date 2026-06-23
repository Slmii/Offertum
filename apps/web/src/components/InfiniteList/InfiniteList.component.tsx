import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { useVirtualizer, useWindowVirtualizer, type Virtualizer } from '@tanstack/react-virtual';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { InfiniteListProps } from './InfiniteList.types';
import { useInfiniteLoadMore } from './useInfiniteLoadMore';

/**
 * DRY virtualized infinite list — list view only (no table/grid). Ported from the toko
 * `v2/InfiniteScroll` to our MUI stack (SCSS → `sx`, custom spinner → MUI `CircularProgress`).
 *
 * Renders only the rows in view via `@tanstack/react-virtual`, auto-firing `onLoadMore` as the
 * tail comes into view (an extra "loading" row shows while `hasNextPage`). Scroll source:
 *  - `scrollRef` given → virtualize against that element;
 *  - else `maxHeight` given → own internal scroll container;
 *  - else (default) → the window (matches the app's window-scroll layout).
 */
export function InfiniteList<T>(props: InfiniteListProps<T>) {
	const isEmpty = props.data.length === 0 && !props.hasNextPage && !props.isFetchingNextPage;
	if (isEmpty && props.emptyState) {
		return <>{props.emptyState}</>;
	}

	// Window-scroll is the default; only switch to element-scroll when the consumer opts in
	// with an external `scrollRef` or an explicit `maxHeight`.
	if (props.scrollRef || props.maxHeight !== undefined) {
		return <ElementList {...props} />;
	}

	return <WindowList {...props} />;
}

/** Window-scroll virtualization — the default for full-page lists. */
function WindowList<T>({
	data,
	renderItem,
	hasNextPage,
	isFetchingNextPage,
	onLoadMore,
	gap = 8,
	estimatedRowHeight = 88
}: InfiniteListProps<T>) {
	const listRef = useRef<HTMLDivElement>(null);
	// The list's offset from the top of the document — keeps window-virtualized rows aligned
	// with their real on-page position. Captured after layout so the first paint is correct.
	const [scrollMargin, setScrollMargin] = useState(0);
	useLayoutEffect(() => {
		setScrollMargin(listRef.current?.offsetTop ?? 0);
	}, []);

	const virtualizer = useWindowVirtualizer({
		count: hasNextPage ? data.length + 1 : data.length,
		estimateSize: () => estimatedRowHeight,
		overscan: 6,
		gap,
		scrollMargin
	});

	useInfiniteLoadMore(virtualizer.getVirtualItems(), data.length, { hasNextPage, isFetchingNextPage, onLoadMore });

	return (
		<Box ref={listRef}>
			<VirtualRows virtualizer={virtualizer} data={data} renderItem={renderItem} scrollMargin={scrollMargin} />
		</Box>
	);
}

/** Element-scroll virtualization — external `scrollRef`, else an internal `maxHeight` box. */
function ElementList<T>({
	data,
	renderItem,
	hasNextPage,
	isFetchingNextPage,
	onLoadMore,
	scrollRef,
	maxHeight = 480,
	gap = 8,
	estimatedRowHeight = 88
}: InfiniteListProps<T>) {
	const internalRef = useRef<HTMLDivElement>(null);
	const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);
	useEffect(() => {
		setScrollElement(scrollRef ? scrollRef.current : internalRef.current);
	}, [scrollRef]);

	// React Compiler can't memoize TanStack Virtual's returned functions; that's expected and
	// safe here (we read the virtualizer synchronously, don't pass it to memoized children).
	// eslint-disable-next-line react-hooks/incompatible-library
	const virtualizer = useVirtualizer({
		count: hasNextPage ? data.length + 1 : data.length,
		estimateSize: () => estimatedRowHeight,
		getScrollElement: () => scrollElement,
		overscan: 6,
		gap
	});

	useInfiniteLoadMore(virtualizer.getVirtualItems(), data.length, { hasNextPage, isFetchingNextPage, onLoadMore });

	const rows = <VirtualRows virtualizer={virtualizer} data={data} renderItem={renderItem} scrollMargin={0} />;

	// External scroll container: the consumer owns scrolling.
	if (scrollRef) {
		return rows;
	}

	return (
		<Box
			ref={internalRef}
			sx={{
				position: 'relative',
				maxHeight,
				overflowY: 'auto',
				// Room so a focused row's outline isn't clipped by the scroll edge.
				p: 0.5,
				m: '-4px'
			}}
		>
			{rows}
		</Box>
	);
}

/** Shared sizer + absolutely-placed rows for both virtualizer flavors. */
function VirtualRows<T>({
	virtualizer,
	data,
	renderItem,
	scrollMargin
}: {
	virtualizer: Virtualizer<Window, Element> | Virtualizer<HTMLElement, Element>;
	data: T[];
	renderItem: (item: T, index: number) => ReactNode;
	scrollMargin: number;
}) {
	// For the window virtualizer `getTotalSize()` includes `scrollMargin` (it measures from the
	// document top), but this sizer already sits `scrollMargin` down the page — subtract it so
	// the page isn't padded with an extra empty band at the bottom. Element mode passes 0.
	return (
		<Box sx={{ position: 'relative', width: '100%', height: virtualizer.getTotalSize() - scrollMargin }}>
			{virtualizer.getVirtualItems().map(row => {
				const isLoaderRow = row.index >= data.length;
				const item = data[row.index];
				if (!isLoaderRow && !item) {
					return null;
				}

				return (
					<Box
						key={row.key}
						data-index={row.index}
						ref={virtualizer.measureElement}
						sx={{
							position: 'absolute',
							top: 0,
							left: 0,
							width: '100%',
							transform: `translateY(${row.start - scrollMargin}px)`
						}}
					>
						{/* Non-loader rows are guaranteed defined by the guard above. */}
						{isLoaderRow ? <LoadMoreRow /> : renderItem(item as T, row.index)}
					</Box>
				);
			})}
		</Box>
	);
}

/** Placeholder row rendered at the tail while more pages are available/loading. */
function LoadMoreRow() {
	return (
		<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, p: 2 }}>
			<CircularProgress size={16} />
		</Box>
	);
}

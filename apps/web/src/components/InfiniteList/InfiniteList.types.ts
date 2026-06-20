import type { ReactNode, RefObject } from 'react';

/** Infinite-loading wiring, resolved by the parent and threaded to the virtualizer. */
export interface InfiniteLoadProps {
	hasNextPage?: boolean;
	isFetchingNextPage?: boolean;
	onLoadMore?: () => void;
}

export interface InfiniteListProps<T> extends InfiniteLoadProps {
	data: T[];
	renderItem: (item: T, index: number) => ReactNode;
	/**
	 * External scroll container to virtualize against. When omitted the component renders
	 * its own scroll container (size it with `maxHeight`).
	 */
	scrollRef?: RefObject<HTMLElement | null>;
	/** Max height of the internal scroll container (ignored when `scrollRef` is provided). */
	maxHeight?: number | string;
	/**
	 * Gap between rows in px.
	 * @default 8
	 */
	gap?: number;
	/**
	 * Estimated row height in px (refined by measurement).
	 * @default 88
	 */
	estimatedRowHeight?: number;
	/** Content shown when `data` is empty and there is nothing more to load. */
	emptyState?: ReactNode;
}

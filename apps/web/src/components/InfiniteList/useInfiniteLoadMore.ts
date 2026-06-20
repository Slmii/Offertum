import type { VirtualItem } from '@tanstack/react-virtual';
import { useEffect } from 'react';
import type { InfiniteLoadProps } from './InfiniteList.types';

/**
 * Fires `onLoadMore` once the last virtual item reaches the end of the loaded set, while
 * there is more to fetch. Keeps the load-more trigger logic in one place.
 */
export function useInfiniteLoadMore(
	virtualItems: VirtualItem[],
	itemCount: number,
	{ hasNextPage, isFetchingNextPage, onLoadMore }: InfiniteLoadProps
) {
	useEffect(() => {
		const lastItem = virtualItems[virtualItems.length - 1];
		if (!lastItem) {
			return;
		}

		if (lastItem.index >= itemCount - 1 && hasNextPage && !isFetchingNextPage) {
			onLoadMore?.();
		}
	}, [virtualItems, itemCount, hasNextPage, isFetchingNextPage, onLoadMore]);
}

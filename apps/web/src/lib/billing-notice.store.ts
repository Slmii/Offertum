import { useSyncExternalStore } from 'react';

/**
 * Tiny pub/sub store for the "your subscription is required" notice.
 *
 * Used as the bridge between React Query's global `MutationCache.onError` /
 * `QueryCache.onError` (which doesn't have direct access to React state) and
 * the `BillingRequiredBanner` mounted in the (app) layout. The MutationCache
 * handler calls `billingNoticeStore.show(message)`; the banner subscribes via
 * `useBillingNotice()` and re-renders when the value changes.
 *
 * Single-slot store — only one active notice at a time. A second `show()` call
 * overwrites the first (later errors are more relevant than older ones).
 */

interface BillingNotice {
	message: string;
	billingPath: string;
}

type Listener = () => void;

let currentNotice: BillingNotice | null = null;
const listeners = new Set<Listener>();

function emit(): void {
	for (const listener of listeners) {
		listener();
	}
}

export const billingNoticeStore = {
	subscribe(listener: Listener): () => void {
		listeners.add(listener);
		return () => listeners.delete(listener);
	},
	getSnapshot(): BillingNotice | null {
		return currentNotice;
	},
	show(notice: BillingNotice): void {
		// Skip churn when the existing notice is identical — avoids re-renders on
		// repeated 402s from the same blocked mutation flurry.
		if (
			currentNotice &&
			currentNotice.message === notice.message &&
			currentNotice.billingPath === notice.billingPath
		) {
			return;
		}
		currentNotice = notice;
		emit();
	},
	clear(): void {
		if (currentNotice === null) {
			return;
		}
		currentNotice = null;
		emit();
	}
};

export function useBillingNotice(): BillingNotice | null {
	return useSyncExternalStore(
		billingNoticeStore.subscribe,
		billingNoticeStore.getSnapshot,
		// SSR snapshot — banner doesn't render on the server, so safe to return null.
		() => null
	);
}

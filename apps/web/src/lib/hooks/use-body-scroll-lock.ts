import { useEffect } from 'react';

/**
 * Locks body scroll while `active` is true — the same UX as opening a MUI Select/Menu (which
 * lock via their `Modal`). The desktop date-picker popover is a `Popper`, not a `Modal`, so it
 * doesn't lock on its own; this fills that gap. Compensates for the scrollbar width (pads the
 * body) so the page doesn't shift when the scrollbar disappears.
 */
export function useBodyScrollLock(active: boolean): void {
	useEffect(() => {
		if (!active) {
			return;
		}
		const { body } = document;
		const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
		const previousOverflow = body.style.overflow;
		const previousPaddingRight = body.style.paddingRight;

		body.style.overflow = 'hidden';
		if (scrollbarWidth > 0) {
			const currentPadding = parseFloat(window.getComputedStyle(body).paddingRight) || 0;
			body.style.paddingRight = `${currentPadding + scrollbarWidth}px`;
		}

		return () => {
			body.style.overflow = previousOverflow;
			body.style.paddingRight = previousPaddingRight;
		};
	}, [active]);
}

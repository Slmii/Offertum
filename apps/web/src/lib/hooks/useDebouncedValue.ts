import { useEffect, useState } from 'react';

/**
 * Returns `value` after it has remained unchanged for `delayMs` milliseconds. Used to
 * throttle search-as-you-type so we don't fire a request on every keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const handle = window.setTimeout(() => setDebounced(value), delayMs);
		return () => window.clearTimeout(handle);
	}, [value, delayMs]);
	return debounced;
}

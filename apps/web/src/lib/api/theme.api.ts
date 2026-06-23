import { readThemeModeFromCookie, type ThemeMode } from '@/lib/utils/theme.utils';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeader } from '@tanstack/react-start/server';

/**
 * SSR read of the persisted theme mode from the request's Cookie header. Called from the root
 * route's `beforeLoad` so the server renders the correct light/dark theme on the first paint
 * (no flash). On the client the root reads `document.cookie` directly instead of calling this.
 */
export const getThemeModeServer = createServerFn({ method: 'GET' }).handler((): ThemeMode => {
	return readThemeModeFromCookie(getRequestHeader('cookie'));
});

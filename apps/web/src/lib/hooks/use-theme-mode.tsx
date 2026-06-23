import { THEME_COOKIE, themeForMode, type ThemeMode } from '@/lib/utils/theme.utils';
import { ThemeProvider } from '@mui/material/styles';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

// 1 year — the cookie is the canonical store (readable at SSR) so the server renders the right mode.
const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

// Both themes are built once at module load — `createTheme` deep-merges the large component-override
// set, so doing it per toggle adds a visible delay. Switching now just swaps a prebuilt object.
const THEMES: Record<ThemeMode, ReturnType<typeof themeForMode>> = {
	light: themeForMode('light'),
	dark: themeForMode('dark')
};

interface ThemeModeContextValue {
	mode: ThemeMode;
	setMode: (mode: ThemeMode) => void;
	toggleMode: () => void;
}

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

/**
 * Provides the active light/dark theme to MUI + exposes the mode through `useThemeMode`.
 *
 * SSR-safety: `initialMode` comes from the `offertum-theme` cookie, read server-side in the root
 * route's `beforeLoad`. Because the server and the first client render both start from that same
 * value, the dark theme paints immediately on refresh — no light→dark flash, no hydration mismatch.
 * Switching writes the cookie (so the next SSR is correct) and `document.documentElement.dataset.theme`
 * so any plain-CSS keyed off `[data-theme="dark"]` stays in sync with MUI.
 */
export function ThemeModeProvider({
	children,
	initialMode = 'light'
}: {
	children: ReactNode;
	initialMode?: ThemeMode;
}) {
	const [mode, setModeState] = useState<ThemeMode>(initialMode);

	useEffect(() => {
		document.documentElement.dataset.theme = mode;
		// Keep the UA color-scheme (scrollbars, form controls, etc.) in sync with the toggle —
		// the SSR value on <html> is from the cookie and doesn't update on client toggles.
		document.documentElement.style.colorScheme = mode;
	}, [mode]);

	const setMode = useCallback((next: ThemeMode): void => {
		setModeState(next);
		// Canonical persistence is the cookie so the next server render matches (lax + path=/ so it
		// rides along with every navigation/refresh request).
		document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;
	}, []);

	useEffect(() => {
		// One-time migration from the legacy localStorage store to the cookie. Runs only until a
		// cookie exists; costs at most one transitional flash for users who set the theme before the
		// cookie switch, after which SSR renders the right mode with no flash.
		if (document.cookie.includes(`${THEME_COOKIE}=`)) {
			return;
		}
		try {
			const legacy = localStorage.getItem(THEME_COOKIE);
			if (legacy === 'light' || legacy === 'dark') {
				// eslint-disable-next-line react-hooks/set-state-in-effect
				setMode(legacy);
			}
		} catch {
			// localStorage unavailable — nothing to migrate.
		}
	}, [setMode]);

	const toggleMode = useCallback((): void => {
		setMode(mode === 'dark' ? 'light' : 'dark');
	}, [mode, setMode]);

	const value = useMemo<ThemeModeContextValue>(() => ({ mode, setMode, toggleMode }), [mode, setMode, toggleMode]);

	return (
		<ThemeModeContext.Provider value={value}>
			<ThemeProvider theme={THEMES[mode]}>{children}</ThemeProvider>
		</ThemeModeContext.Provider>
	);
}

/** Read + control the active light/dark theme mode. Must be used under `ThemeModeProvider`. */
export function useThemeMode(): ThemeModeContextValue {
	const ctx = useContext(ThemeModeContext);
	if (!ctx) {
		throw new Error('useThemeMode must be used within a ThemeModeProvider');
	}
	return ctx;
}

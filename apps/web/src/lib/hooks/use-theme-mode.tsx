import { themeForMode, type ThemeMode } from '@/lib/utils/theme.utils';
import { ThemeProvider } from '@mui/material/styles';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

const THEME_STORAGE_KEY = 'offertum-theme';

interface ThemeModeContextValue {
	mode: ThemeMode;
	setMode: (mode: ThemeMode) => void;
	toggleMode: () => void;
}

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

function isThemeMode(value: string | null): value is ThemeMode {
	return value === 'light' || value === 'dark';
}

/**
 * Provides the active light/dark theme to MUI + exposes the mode through `useThemeMode`.
 *
 * SSR-safety: the server and the first client render both default to `'light'` so the markup
 * matches (no hydration mismatch). The persisted choice in `localStorage['offertum-theme']` is
 * read once after mount and applied via state — the same "render after mount" pattern the app
 * shell uses for the collapsed sidebar. Switching also writes `document.documentElement.dataset.theme`
 * so any plain-CSS that keys off `[data-theme="dark"]` stays in sync with MUI.
 */
export function ThemeModeProvider({ children }: { children: ReactNode }) {
	const [mode, setModeState] = useState<ThemeMode>('light');

	useEffect(() => {
		try {
			const stored = localStorage.getItem(THEME_STORAGE_KEY);
			if (isThemeMode(stored)) {
				// eslint-disable-next-line react-hooks/set-state-in-effect
				setModeState(stored);
			}
		} catch {
			// localStorage unavailable (private mode / SSR): keep the light default.
		}
	}, []);

	useEffect(() => {
		document.documentElement.dataset.theme = mode;
	}, [mode]);

	const setMode = useCallback((next: ThemeMode): void => {
		setModeState(next);
		try {
			localStorage.setItem(THEME_STORAGE_KEY, next);
		} catch {
			// Non-fatal: the switch still applies for this session.
		}
	}, []);

	const toggleMode = useCallback((): void => {
		setMode(mode === 'dark' ? 'light' : 'dark');
	}, [mode, setMode]);

	const value = useMemo<ThemeModeContextValue>(() => ({ mode, setMode, toggleMode }), [mode, setMode, toggleMode]);
	const activeTheme = useMemo(() => themeForMode(mode), [mode]);

	return (
		<ThemeModeContext.Provider value={value}>
			<ThemeProvider theme={activeTheme}>{children}</ThemeProvider>
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

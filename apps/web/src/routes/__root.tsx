/// <reference types="vite/client" />
import { getThemeModeServer } from '@/lib/api/theme.api';
import { ThemeModeProvider } from '@/lib/hooks/use-theme-mode';
import { ToastProvider } from '@/lib/hooks/use-toast';
import { sessionQueryOptions } from '@/lib/queries/auth.queries';
import { readThemeModeFromCookie, type ThemeMode } from '@/lib/utils/theme.utils';
import createCache from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import CssBaseline from '@mui/material/CssBaseline';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { nlNL } from '@mui/x-date-pickers/locales';
import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from '@tanstack/react-router';
import 'dayjs/locale/nl';
import { useMemo, type ReactNode } from 'react';

const pickerLocaleText = nlNL.components.MuiLocalizationProvider.defaultProps.localeText;

export const Route = createRootRouteWithContext<{
	queryClient: QueryClient;
}>()({
	beforeLoad: async ({ context }) => {
		const session = await context.queryClient.ensureQueryData(sessionQueryOptions);
		// Resolve the theme mode before first paint: read the request cookie on the server, or
		// document.cookie on the client. Feeds the provider's initial mode → no light→dark flash.
		const themeMode: ThemeMode =
			typeof document === 'undefined' ? await getThemeModeServer() : readThemeModeFromCookie(document.cookie);
		return { session, themeMode };
	},
	head: () => ({
		meta: [
			{
				charSet: 'utf-8'
			},
			{
				name: 'viewport',
				content: 'width=device-width, initial-scale=1'
			}
		],
		links: [
			{ rel: 'preconnect', href: 'https://fonts.googleapis.com' },
			{ rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
			{
				rel: 'stylesheet',
				href: 'https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=Playfair+Display:ital,wght@0,400..900;1,400..900&display=swap'
			}
		]
	}),
	component: RootComponent
});

function RootComponent() {
	// `select` so this subscribes to the themeMode VALUE, not the whole context object — beforeLoad
	// returns a fresh context object every navigation, and reading it unscoped would re-render the
	// entire provider tree on every nav (which recreated the emotion cache → progressive lag).
	const themeMode = Route.useRouteContext({ select: context => context.themeMode });
	return (
		<RootDocument themeMode={themeMode}>
			<Outlet />
		</RootDocument>
	);
}

function Providers({ children, initialMode }: { children: React.ReactNode; initialMode: ThemeMode }) {
	// One stable emotion cache for the app's lifetime. Recreating it per render re-injects every
	// style rule and leaks <style> tags across navigations — the cause of the build-up lag.
	const emotionCache = useMemo(() => createCache({ key: 'css' }), []);

	return (
		<CacheProvider value={emotionCache}>
			<ThemeModeProvider initialMode={initialMode}>
				<LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale='nl' localeText={pickerLocaleText}>
					<CssBaseline />
					<ToastProvider>{children}</ToastProvider>
				</LocalizationProvider>
			</ThemeModeProvider>
		</CacheProvider>
	);
}

function RootDocument({ children, themeMode }: Readonly<{ children: ReactNode; themeMode: ThemeMode }>) {
	return (
		// data-theme + color-scheme set server-side so the document background matches before MUI
		// hydrates — the actual MUI styles are already correct because the provider starts in this mode.
		<html lang='en' data-theme={themeMode} style={{ colorScheme: themeMode }}>
			<head>
				<HeadContent />
			</head>
			<body>
				<Providers initialMode={themeMode}>{children}</Providers>
				<Scripts />
			</body>
		</html>
	);
}

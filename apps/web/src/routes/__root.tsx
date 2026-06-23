/// <reference types="vite/client" />
import { ThemeModeProvider } from '@/lib/hooks/use-theme-mode';
import { ToastProvider } from '@/lib/hooks/use-toast';
import { sessionQueryOptions } from '@/lib/queries/auth.queries';
import createCache from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import CssBaseline from '@mui/material/CssBaseline';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { nlNL } from '@mui/x-date-pickers/locales';
import 'dayjs/locale/nl';

const pickerLocaleText = nlNL.components.MuiLocalizationProvider.defaultProps.localeText;
import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from '@tanstack/react-router';
import type { ReactNode } from 'react';

export const Route = createRootRouteWithContext<{
	queryClient: QueryClient;
}>()({
	beforeLoad: async ({ context }) => {
		const session = await context.queryClient.ensureQueryData(sessionQueryOptions);
		return { session };
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
	return (
		<RootDocument>
			<Outlet />
		</RootDocument>
	);
}

function Providers({ children }: { children: React.ReactNode }) {
	const emotionCache = createCache({ key: 'css' });

	return (
		<CacheProvider value={emotionCache}>
			<ThemeModeProvider>
				<LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale='nl' localeText={pickerLocaleText}>
					<CssBaseline />
					<ToastProvider>{children}</ToastProvider>
				</LocalizationProvider>
			</ThemeModeProvider>
		</CacheProvider>
	);
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
	return (
		<html lang='en'>
			<head>
				<HeadContent />
			</head>
			<body>
				<Providers>{children}</Providers>
				<Scripts />
			</body>
		</html>
	);
}

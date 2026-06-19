import { Sidebar } from '@/components/Sidebar.component';
import { TopBar } from '@/components/TopBar.component';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import { useTheme } from '@mui/material/styles';
import { useEffect, useState, type ReactNode } from 'react';

const COLLAPSE_STORAGE_KEY = 'offertum.sidebar.collapsed';
const COLLAPSED_WIDTH = 64;

/**
 * App shell: collapsible sidebar + sticky top bar wrapping the routed page (`children`).
 * Collapsed state persists in localStorage. Initialised to `false` (not read from storage
 * in the initializer) so SSR and the first client render agree — the stored value is
 * applied in an effect, avoiding a hydration mismatch.
 */
export function AppShell({ children }: { children: ReactNode }) {
	const { tokens } = useTheme();
	const [collapsed, setCollapsed] = useState(false);

	useEffect(() => {
		// One-time read of persisted collapsed state after mount (kept out of the initializer to
		// avoid an SSR/client hydration mismatch). This is the legitimate "render after mount"
		// exception, not a state-sync loop — same pattern the calendar/opportunities routes use.
		try {
			// eslint-disable-next-line react-hooks/set-state-in-effect
			setCollapsed(localStorage.getItem(COLLAPSE_STORAGE_KEY) === '1');
		} catch {
			// localStorage unavailable (private mode / SSR): keep the expanded default.
		}
	}, []);

	const toggleCollapsed = (): void => {
		setCollapsed(prev => {
			const next = !prev;
			try {
				localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? '1' : '0');
			} catch {
				// Non-fatal: the toggle still works for this session.
			}
			return next;
		});
	};

	return (
		<Box
			sx={{
				display: 'grid',
				gridTemplateColumns: `${collapsed ? COLLAPSED_WIDTH : tokens.layout.sidebarWidth}px 1fr`,
				minHeight: '100vh',
				backgroundColor: tokens.color.paper,
				transition: `grid-template-columns ${tokens.motion.durSlow}ms ${tokens.motion.easeOut}`
			}}
		>
			<Sidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
			<Box component='main' sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
				<TopBar />
				<Container maxWidth='lg' sx={{ py: 6 }}>
					<Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>
				</Container>
			</Box>
		</Box>
	);
}

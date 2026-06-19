import { AppIcon } from '@/components/AppIcon.component';
import { GlobalSearch } from '@/components/GlobalSearch.component';
import { NotificationBell } from '@/components/NotificationBell.component';
import { SilentErrorBoundary } from '@/components/SilentErrorBoundary.component';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import { Fragment, Suspense } from 'react';

interface TopBarProps {
	// Chevron-separated crumbs rendered on the left. The last crumb is the current page
	// (emphasised); earlier crumbs are muted. The page's own H1 remains the title source of
	// truth, so the bar never repeats it.
	breadcrumb?: string[];
}

/**
 * Sticky top bar inside the main column. Carries an optional breadcrumb (left), the global
 * search (⌘K), and global actions on the right (notifications bell).
 */
export function TopBar({ breadcrumb }: TopBarProps) {
	const { tokens } = useTheme();
	return (
		<Box
			component='header'
			sx={{
				height: `${tokens.layout.topbarHeight}px`,
				borderBottom: `1px solid ${tokens.color.line}`,
				backgroundColor: tokens.color.paper,
				px: 3,
				display: 'flex',
				alignItems: 'center',
				gap: 2,
				position: 'sticky',
				top: 0,
				zIndex: 50
			}}
		>
			<Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 2 }}>
				{breadcrumb && breadcrumb.length > 0 && (
					<Box
						component='nav'
						aria-label='Kruimelpad'
						sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0, flexShrink: 0 }}
					>
						{breadcrumb.map((crumb, index) => {
							const isLast = index === breadcrumb.length - 1;
							return (
								<Fragment key={`${crumb}-${index}`}>
									{index > 0 && (
										<Box
											component='span'
											aria-hidden='true'
											sx={{ display: 'inline-flex', color: tokens.color.ink4, flexShrink: 0 }}
										>
											<AppIcon name='chevron-right' size='small' />
										</Box>
									)}
									<Box
										component='span'
										aria-current={isLast ? 'page' : undefined}
										sx={{
											fontSize: 13,
											fontWeight: isLast ? 'medium' : 'normal',
											color: isLast ? tokens.color.ink2 : tokens.color.ink4,
											whiteSpace: 'nowrap',
											overflow: 'hidden',
											textOverflow: 'ellipsis'
										}}
									>
										{crumb}
									</Box>
								</Fragment>
							);
						})}
					</Box>
				)}
			</Box>
			<Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
				{/* Search sits on the right, next to the notification bell. */}
				<Box sx={{ width: { xs: 160, sm: 220, md: 300 } }}>
					<SilentErrorBoundary>
						<Suspense fallback={null}>
							<GlobalSearch />
						</Suspense>
					</SilentErrorBoundary>
				</Box>
				<SilentErrorBoundary>
					<Suspense fallback={null}>
						<NotificationBell />
					</Suspense>
				</SilentErrorBoundary>
			</Box>
		</Box>
	);
}

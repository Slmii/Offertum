import { AppIcon } from '@/components/AppIcon.component';
import { toReadableTimestamp } from '@/lib/utils/date.utils';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import type { Opportunity } from '@offertum/shared';

/**
 * Compact "last activity" pill for a list row. Icon + accent vary by actor kind: a customer
 * reply (reply icon), an Offertum/system action (sparkles, accent), or an owner edit (user).
 * Renders nothing when there's been no activity beyond the original request.
 */
export function LastActivityBadge({ lastActivity }: { lastActivity: Opportunity['lastActivity'] }) {
	const { tokens } = useTheme();
	if (!lastActivity) {
		return null;
	}

	const c = tokens.color;
	// customer reply → reply arrow; Offertum/system → sparkles; owner edit → pencil (edited by).
	const icon =
		lastActivity.kind === 'customer' ? 'corner-up-left' : lastActivity.kind === 'system' ? 'sparkles' : 'pen-line';

	const iconColor = lastActivity.kind === 'system' ? c.accent[500] : c.ink4;
	return (
		<Box
			component='span'
			sx={{
				display: 'inline-flex',
				alignItems: 'center',
				gap: 0.75,
				flexShrink: 0,
				px: 1,
				py: 0.25,
				backgroundColor: c.paper2,
				border: `1px solid ${c.line}`,
				color: c.ink3,
				fontSize: 11,
				fontWeight: 'medium',
				borderRadius: `${tokens.radius.sm}px`,
				whiteSpace: 'nowrap'
			}}
		>
			<Box component='span' sx={{ display: 'inline-flex', color: iconColor }}>
				<AppIcon name={icon} size='small' />
			</Box>
			<Box component='span' sx={{ color: c.ink2 }}>
				{lastActivity.label}
			</Box>
			<Box component='span' sx={{ color: c.ink4 }}>
				·
			</Box>
			<Box component='span' sx={{ fontVariantNumeric: 'tabular-nums' }}>
				{toReadableTimestamp(lastActivity.at)}
			</Box>
		</Box>
	);
}

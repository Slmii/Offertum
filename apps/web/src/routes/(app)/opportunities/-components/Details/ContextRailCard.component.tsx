import { AppIcon } from '@/components/AppIcon.component';
import { Avatar } from '@/components/Avatar.component';
import { BodySmall } from '@/components/Text.component';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import { useTheme } from '@mui/material/styles';

/**
 * Context-rail contact card — ported from the design's `ContextRailCard` (Werkruimte).
 * Customer identity (neutral avatar + display-font name + email) and two quick-contact
 * buttons (Mail / Bel). Sits at the top of the sticky right rail. The status switcher lives
 * in the header next to the urgency dot (with the `StatusPipeline` mirroring it read-only),
 * so it's intentionally not repeated here.
 */
export function ContextRailCard({
	customerName,
	customerEmail
}: {
	customerName: string | null;
	customerEmail: string | null;
}) {
	const { tokens } = useTheme();
	const c = tokens.color;
	const displayName = customerName?.trim() || customerEmail || 'Onbekende klant';

	// Shared style for the two quick-contact buttons (Mail / Bel) — flex 1, 34px tall, neutral.
	const contactButtonSx = {
		flex: 1,
		display: 'inline-flex',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 0.75,
		height: 34,
		borderRadius: `${tokens.radius.md}px`,
		border: `1px solid ${c.lineStrong}`,
		backgroundColor: c.surface,
		color: c.ink2,
		fontSize: 13,
		fontWeight: 'medium',
		fontFamily: tokens.font.sans,
		textDecoration: 'none',
		cursor: 'pointer',
		'&:hover': { backgroundColor: c.paper2 }
	} as const;

	return (
		<Paper variant='outlined' sx={{ p: '18px' }}>
			<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: '14px' }}>
				<Avatar name={displayName} size={44} />
				<Box sx={{ minWidth: 0 }}>
					<Box
						sx={{
							fontFamily: tokens.font.display,
							fontSize: 17,
							fontWeight: 'medium',
							color: c.ink1,
							lineHeight: 1.25,
							overflow: 'hidden',
							textOverflow: 'ellipsis',
							whiteSpace: 'nowrap'
						}}
					>
						{displayName}
					</Box>
					{customerEmail && (
						<BodySmall
							color='textSecondary'
							sx={{
								overflow: 'hidden',
								textOverflow: 'ellipsis',
								whiteSpace: 'nowrap',
								display: 'block'
							}}
						>
							{customerEmail}
						</BodySmall>
					)}
				</Box>
			</Box>

			<Box sx={{ display: 'flex', gap: 1 }}>
				<Box
					component='a'
					target='_blank'
					href={customerEmail ? `mailto:${customerEmail}` : undefined}
					sx={{
						...contactButtonSx,
						pointerEvents: customerEmail ? 'auto' : 'none',
						opacity: customerEmail ? 1 : 0.55
					}}
				>
					<AppIcon name='mail' size='small' /> Mail
				</Box>
				{/* Phone number extraction is not yet implemented — no customerPhone field
				    exists in the opportunity data model. The button is disabled until
				    a phone field is added to the extractor. */}
				<Box
					component='a'
					sx={{
						...contactButtonSx,
						pointerEvents: 'none',
						opacity: 0.55
					}}
					aria-disabled='true'
				>
					<AppIcon name='phone' size='small' /> Bel
				</Box>
			</Box>
		</Paper>
	);
}

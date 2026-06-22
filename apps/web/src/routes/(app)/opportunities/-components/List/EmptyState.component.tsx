import { AppIcon, type AppIconName } from '@/components/AppIcon.component';
import { SubscribeCta } from '@/components/SubscribeCta.component';
import { BodySmall, H2 } from '@/components/Text.component';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import { useTheme } from '@mui/material/styles';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';

/**
 * Empty-state card for the opportunities list. Picks copy based on WHY the list is empty:
 * a dismissed-only view, an active filter/search with no matches, or a genuinely empty
 * inbox (with an entitlement-aware subscribe nudge when the org can't connect a mailbox yet).
 * All variants share the polished `EmptyCard` shell.
 */
export function EmptyState({ isEntitled, isOwner }: { isEntitled: boolean; isOwner: boolean }) {
	// Feature-empty (no filter active) + NOT entitled: the user can't connect a mailbox
	// yet, so the "wait for your connected mailbox" copy is misleading. Nudge them to subscribe.
	if (!isEntitled) {
		return (
			<EmptyCard
				icon='lock'
				title='Nog geen offerteaanvragen'
				subtitle='Abonneer en verbind je mailbox om offerteaanvragen automatisch binnen te halen.'
			>
				<SubscribeCta isOwner={isOwner} />
			</EmptyCard>
		);
	}

	// Feature-empty + entitled: mailbox can be connected; the inbox just hasn't filled yet.
	return (
		<EmptyCard
			icon='inbox'
			title='Nog geen offerteaanvragen'
			subtitle="Zodra er een binnenkomt op je verbonden mailbox, zie je 'm hier meestal binnen een paar minuten."
			footer={
				<>
					<Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, fontSize: 13, color: 'inherit' }}>
						<Box component='span' sx={{ display: 'inline-flex' }}>
							<AppIcon name='mail' size='small' />
						</Box>
						Mist er een aanvraag? Controleer je mailboxkoppeling.
					</Box>
					<Button
						component={Link}
						to='/settings/email'
						variant='contained'
						size='small'
						endIcon={<AppIcon name='arrow-right' size='small' />}
					>
						Mailbox-instellingen
					</Button>
				</>
			}
		/>
	);
}

/**
 * Shared empty-state shell — ported from the design's `EmptyOpportunities`: a centered icon
 * tile + serif heading + reassuring copy, with optional inline `children` (a pill or CTA) and
 * an optional quiet `footer` band.
 */
function EmptyCard({
	icon,
	title,
	subtitle,
	children,
	footer
}: {
	icon: AppIconName;
	title: string;
	subtitle: string;
	children?: ReactNode;
	footer?: ReactNode;
}) {
	const { tokens } = useTheme();
	const c = tokens.color;

	return (
		<Paper variant='outlined' sx={{ p: 0, overflow: 'hidden' }}>
			<Stack useFlexGap spacing={2.25} sx={{ alignItems: 'center', textAlign: 'center', px: 3, pt: 8, pb: 7 }}>
				<Box
					sx={{
						width: 56,
						height: 56,
						borderRadius: `${tokens.radius.lg}px`,
						backgroundColor: c.paper2,
						border: `1px solid ${c.line}`,
						color: c.ink3,
						display: 'inline-flex',
						alignItems: 'center',
						justifyContent: 'center'
					}}
				>
					<AppIcon name={icon} size='large' />
				</Box>

				<Stack useFlexGap spacing={1} sx={{ alignItems: 'center' }}>
					<H2 component='h2'>{title}</H2>
					<BodySmall color='textSecondary' sx={{ maxWidth: 380, lineHeight: 1.55 }}>
						{subtitle}
					</BodySmall>
				</Stack>

				{children}
			</Stack>

			{footer && (
				<Box
					sx={{
						borderTop: `1px solid ${c.line}`,
						backgroundColor: c.paper2,
						color: c.ink3,
						px: 2.5,
						py: 1.75,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'space-between',
						gap: 2,
						flexWrap: 'wrap'
					}}
				>
					{footer}
				</Box>
			)}
		</Paper>
	);
}

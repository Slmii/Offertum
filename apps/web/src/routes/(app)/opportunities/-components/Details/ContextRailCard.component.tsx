import { AppIcon, type AppIconName } from '@/components/AppIcon.component';
import { Avatar } from '@/components/Avatar.component';
import { SplitButton } from '@/components/SplitButton.component';
import { BodySmall } from '@/components/Text.component';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import { useTheme } from '@mui/material/styles';

interface MailTarget {
	label: string;
	icon: AppIconName;
	url: string;
	// Web-compose targets open in a new tab; the default mailapp uses a `mailto:` handoff.
	external: boolean;
}

/** Compose-URL targets for an email — the default OS mail app plus Gmail / Outlook web. */
function mailTargetsFor(email: string): MailTarget[] {
	const to = encodeURIComponent(email);
	return [
		{ label: 'Standaard mailapp', icon: 'mail', url: `mailto:${email}`, external: false },
		{
			label: 'Gmail',
			icon: 'brand-gmail',
			url: `https://mail.google.com/mail/?view=cm&fs=1&to=${to}`,
			external: true
		},
		{
			label: 'Outlook',
			icon: 'brand-office',
			url: `https://outlook.office.com/mail/deeplink/compose?to=${to}`,
			external: true
		}
	];
}

/**
 * Context-rail contact card — ported from the design's `ContextRailCard` (Werkruimte).
 * Customer identity (neutral avatar + display-font name + email) and two quick-contact
 * buttons (Mail / Bel). Sits at the top of the sticky right rail. The status switcher lives
 * in the header next to the urgency dot (with the `StatusPipeline` mirroring it read-only),
 * so it's intentionally not repeated here.
 */
export function ContextRailCard({
	customerName,
	customerEmail,
	customerPhone
}: {
	customerName: string | null;
	customerEmail: string | null;
	customerPhone: string | null;
}) {
	const { tokens } = useTheme();
	const c = tokens.color;
	const displayName = customerName?.trim() || customerEmail || 'Onbekende klant';

	// "Mail" is a split button: the main button opens the OS default mail app, the arrow menu
	// offers Gmail / Outlook web compose. Targets carry a pre-filled `to=`.
	const mailTargets = customerEmail ? mailTargetsFor(customerEmail) : [];
	const openMailTarget = (target: MailTarget) => {
		if (target.external) {
			window.open(target.url, '_blank', 'noopener,noreferrer');
		} else {
			window.location.assign(target.url);
		}
	};
	const mailOptions = mailTargets.map(target => ({
		label: target.label,
		icon: target.icon,
		onClick: () => openMailTarget(target)
	}));

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
		<Paper variant='outlined' sx={{ p: 2.25 }}>
			<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.75 }}>
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
					{customerPhone && (
						<BodySmall color='textSecondary' sx={{ display: 'block', whiteSpace: 'nowrap' }}>
							{customerPhone}
						</BodySmall>
					)}
				</Box>
			</Box>

			<Box sx={{ display: 'flex', gap: 1 }}>
				<SplitButton
					sx={{ flex: 1 }}
					disabled={!customerEmail}
					ariaLabel='Kies mailapp'
					primary={{
						label: 'Mail',
						icon: 'mail',
						onClick: () => mailTargets[0] && openMailTarget(mailTargets[0])
					}}
					options={mailOptions.slice(1)} // skip the first target, which is the primary button
				/>
				<Box
					component='a'
					href={customerPhone ? `tel:${customerPhone.replace(/\s+/g, '')}` : undefined}
					sx={{
						...contactButtonSx,
						pointerEvents: customerPhone ? 'auto' : 'none',
						opacity: customerPhone ? 1 : 0.55
					}}
					aria-disabled={customerPhone ? undefined : 'true'}
				>
					<AppIcon name='phone' size='small' /> Bel
				</Box>
			</Box>
		</Paper>
	);
}

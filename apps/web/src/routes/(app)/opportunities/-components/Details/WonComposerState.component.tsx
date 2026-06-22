import { AppIcon } from '@/components/AppIcon.component';
import { BodySmall } from '@/components/Text.component';
import { toReadableDateTime } from '@/lib/utils/date.utils';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import { useTheme } from '@mui/material/styles';

/**
 * Won-state milestone card — ported from the design's `WonComposerState` (Werkruimte).
 * Replaces the composer when the deal is won: a calm forest-green card (trophy + "Gewonnen" +
 * confirmation), with the planned appointment + a "Bericht sturen" follow-up action in the
 * footer. The opdrachtwaarde + "Offerte bekijken" are intentionally omitted while the quote
 * surface lives on its own (deferred) page.
 */
export function WonComposerState({
	customerName,
	appointmentIso,
	isComposing,
	onComposeFollowup
}: {
	customerName: string | null;
	appointmentIso: string | null;
	isComposing: boolean;
	onComposeFollowup: () => void;
}) {
	const { tokens } = useTheme();
	const c = tokens.color;
	const confirmedBy = customerName?.trim() ? ` door ${customerName.trim()}` : '';

	return (
		<Box
			sx={{
				border: `1px solid ${c.won[500]}`,
				borderRadius: `${tokens.radius.lg}px`,
				backgroundColor: c.won[50],
				overflow: 'hidden'
			}}
		>
			<Box sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 2 }}>
				<Box
					component='span'
					sx={{
						width: 46,
						height: 46,
						borderRadius: `${tokens.radius.md}px`,
						backgroundColor: c.won[500],
						color: '#fff',
						display: 'inline-flex',
						alignItems: 'center',
						justifyContent: 'center',
						flexShrink: 0
					}}
				>
					<AppIcon name='trophy' size='large' />
				</Box>
				<Box sx={{ flex: 1, minWidth: 0 }}>
					<Box sx={{ fontFamily: tokens.font.display, fontSize: 19, fontWeight: 'bold', color: c.won[700] }}>
						Gewonnen
					</Box>
					<BodySmall color='textSecondary' sx={{ mt: '2px' }}>
						De opdracht is bevestigd{confirmedBy}. Mooi werk.
					</BodySmall>
				</Box>
			</Box>

			<Box
				sx={{
					py: 1.5,
					px: 2.5,
					borderTop: `1px solid ${c.won[500]}`,
					backgroundColor: c.surface,
					display: 'flex',
					alignItems: 'center',
					gap: 2,
					flexWrap: 'wrap',
					rowGap: 1
				}}
			>
				{appointmentIso && (
					<BodySmall sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
						<Box component='span' sx={{ display: 'inline-flex', color: c.won[700] }}>
							<AppIcon name='calendar' size='small' />
						</Box>
						Ingepland {toReadableDateTime(appointmentIso)}
					</BodySmall>
				)}
				<Button
					variant='contained'
					size='small'
					onClick={onComposeFollowup}
					disabled={isComposing}
					startIcon={
						isComposing ? <CircularProgress size={14} /> : <AppIcon name='corner-up-left' size='small' />
					}
					sx={{ ml: 'auto', flexShrink: 0 }}
				>
					{isComposing ? 'Bezig…' : 'Bericht sturen'}
				</Button>
			</Box>
		</Box>
	);
}

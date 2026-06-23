import { AppIcon } from '@/components/AppIcon.component';
import { toReadableDateTime } from '@/lib/utils/date.utils';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import { useTheme } from '@mui/material/styles';

/**
 * Sent-state milestone card — ported from the design's `SentComposerState` (Werkruimte).
 * Replaces the composer once the latest draft is sent: a calm accent card confirming the
 * version + send time, with a "Concept-vervolg opstellen" action for an out-of-band follow-up.
 */
export function SentComposerState({
	sentAtIso,
	version,
	isComposing,
	onComposeFollowup
}: {
	sentAtIso: string;
	version: number;
	isComposing: boolean;
	onComposeFollowup: () => void;
}) {
	const { tokens } = useTheme();
	const c = tokens.color;
	return (
		<Box
			sx={{
				border: `1px solid ${c.accent[300]}`,
				borderRadius: `${tokens.radius.lg}px`,
				backgroundColor: c.accent[50],
				p: '18px',
				display: 'flex',
				alignItems: 'center',
				gap: 1.75,
				flexWrap: 'wrap',
				rowGap: 1.5
			}}
		>
			<Box
				component='span'
				sx={{
					width: 38,
					height: 38,
					borderRadius: `${tokens.radius.md}px`,
					backgroundColor: c.accent[500],
					color: c.accent.fg,
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
					flexShrink: 0
				}}
			>
				<AppIcon name='check' size='medium' />
			</Box>
			<Stack sx={{ flex: 1, minWidth: 0 }}>
				<Box sx={{ fontSize: 14, fontWeight: 'bold', color: c.ink1 }}>
					v{version} · Verzonden om {toReadableDateTime(sentAtIso)}
				</Box>
				<Box sx={{ fontSize: 12, color: c.accent[700] }}>
					Dit antwoord staat in je verzonden-folder. Je kan een vervolg opstellen wanneer nodig.
				</Box>
			</Stack>
			<Button
				variant='outlined'
				color='inherit'
				size='small'
				onClick={onComposeFollowup}
				disabled={isComposing}
				startIcon={
					isComposing ? <CircularProgress size={14} /> : <AppIcon name='corner-up-left' size='small' />
				}
				sx={{ flexShrink: 0 }}
			>
				{isComposing ? 'Bezig…' : 'Vervolg opstellen'}
			</Button>
		</Box>
	);
}

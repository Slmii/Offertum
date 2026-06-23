import { Overline } from '@/components/Text.component';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import { useTheme } from '@mui/material/styles';

/**
 * Brand-voice "yes / no" guideline block — ported from the design system's
 * `Voice — yes / no` card. Two columns: ✓ on-brand copy (vibrant green) vs ✗ off-brand
 * (vibrant red). DRY: pass the `yes` / `no` sample strings; labels are overridable.
 *
 * The vibrant green/red here are the design system's dedicated VOICE colors (do/don't
 * emphasis) — intentionally NOT the desaturated `won`/`lost` status palette, so they're
 * defined as local constants rather than theme status tokens.
 */
const VOICE_TONES = {
	yes: { bg: '#DCFCE7', border: '#16A34A', fg: '#14532D', mark: '✓' },
	no: { bg: '#FEE2E0', border: '#DC2D1D', fg: '#7F1810', mark: '✗' }
} as const;

interface VoiceExampleProps {
	yes: string[];
	no: string[];
	yesLabel?: string;
	noLabel?: string;
}

export function VoiceExample({ yes, no, yesLabel = 'Quoteom voice', noLabel = 'Off-brand' }: VoiceExampleProps) {
	return (
		<Stack direction={{ xs: 'column', sm: 'row' }} useFlexGap spacing={2.25} sx={{ alignItems: 'stretch' }}>
			<VoiceColumn tone='yes' label={`${VOICE_TONES.yes.mark} ${yesLabel}`} samples={yes} />
			<VoiceColumn tone='no' label={`${VOICE_TONES.no.mark} ${noLabel}`} samples={no} />
		</Stack>
	);
}

function VoiceColumn({ tone, label, samples }: { tone: keyof typeof VOICE_TONES; label: string; samples: string[] }) {
	const { tokens } = useTheme();
	const t = VOICE_TONES[tone];
	return (
		<Stack useFlexGap spacing={1} sx={{ flex: 1, minWidth: 0 }}>
			<Overline sx={{ color: t.fg }}>{label}</Overline>
			{samples.map((sample, index) => (
				<Box
					key={index}
					sx={{
						py: 1.25,
						px: 1.5,
						borderRadius: `${tokens.radius.md}px`,
						border: `1px solid ${t.border}`,
						backgroundColor: t.bg,
						color: t.fg,
						fontFamily: tokens.font.sans,
						fontSize: 14,
						lineHeight: 1.5
					}}
				>
					{sample}
				</Box>
			))}
		</Stack>
	);
}

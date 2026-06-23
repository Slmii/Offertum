import { AppIcon } from '@/components/AppIcon.component';
import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import { useTheme } from '@mui/material/styles';

// Skeleton "paragraphs" of the draft being written — bar widths per line, grouped so the gaps
// read as a real email (greeting · two body blocks · sign-off). Mirrors the design 1:1.
const SKELETON_PARAGRAPHS: string[][] = [['30%'], ['98%', '80%', '62%'], ['88%', '52%'], ['72%'], ['22%']];

/**
 * Loading state for the reply composer while a draft is being (re)generated — ported from the
 * design's "Concept wordt opgesteld" card. Accent header band (sparkles tile + title + subtitle +
 * spinner), a shimmering paragraph skeleton standing in for the draft body, and a footer hint with
 * a muted (inert) "Verstuur" button. Shown in place of the editor during initial generation and
 * during regenerate-in-my-style.
 */
export function ComposerLoadingState({ customerName }: { customerName: string | null }) {
	const { tokens } = useTheme();
	const c = tokens.color;

	return (
		<Box
			sx={{
				border: `1px solid ${c.accent[300]}`,
				borderRadius: `${tokens.radius.lg}px`,
				backgroundColor: c.surface,
				boxShadow: tokens.shadow[2],
				overflow: 'hidden'
			}}
		>
			{/* Header band — accent-tinted */}
			<Box
				sx={{
					py: 2,
					px: 2.25,
					borderBottom: `1px solid ${c.accent[200]}`,
					backgroundColor: c.accent[50],
					display: 'flex',
					alignItems: 'center',
					gap: 1.5
				}}
			>
				<Box
					component='span'
					sx={{
						flexShrink: 0,
						width: 38,
						height: 38,
						borderRadius: `${tokens.radius.md}px`,
						backgroundColor: c.accent[500],
						color: c.accent.fg,
						display: 'inline-flex',
						alignItems: 'center',
						justifyContent: 'center'
					}}
				>
					<AppIcon name='sparkles' size='medium' />
				</Box>
				<Box sx={{ flex: 1, minWidth: 0 }}>
					<Box sx={{ fontSize: 16, fontWeight: 'bold', color: c.ink1 }}>Concept wordt opgesteld</Box>
					<Box sx={{ fontSize: 14, color: c.accent[700], mt: 0.25 }}>
						{customerName
							? `Offertum schrijft een antwoord voor ${customerName} in jouw stijl.`
							: 'Offertum schrijft een antwoord in jouw stijl.'}
					</Box>
				</Box>
			</Box>

			{/* Body — shimmering paragraph skeleton */}
			<Box sx={{ p: 2.75, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
				{SKELETON_PARAGRAPHS.map((paragraph, paragraphIndex) => (
					<Box key={paragraphIndex} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
						{paragraph.map((width, lineIndex) => (
							<Skeleton
								key={lineIndex}
								variant='rounded'
								animation='wave'
								width={width}
								height={14}
								sx={{ borderRadius: `${tokens.radius.full}px` }}
							/>
						))}
					</Box>
				))}
			</Box>

			{/* Footer band — hint + inert (muted) send button */}
			<Box
				sx={{
					py: 1.75,
					px: 2.25,
					borderTop: `1px solid ${c.line}`,
					backgroundColor: c.paper2,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					gap: 1.5
				}}
			>
				<Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, color: c.ink3, fontSize: 14 }}>
					<AppIcon name='pen-line' size='small' />
					Je kan het concept aanpassen zodra het klaar is.
				</Box>
				<Box
					component='span'
					aria-hidden='true'
					sx={{
						display: 'inline-flex',
						alignItems: 'center',
						gap: 0.75,
						px: 2,
						height: 38,
						borderRadius: `${tokens.radius.md}px`,
						backgroundColor: c.accent[300],
						color: c.accent.fg,
						fontFamily: tokens.font.sans,
						fontSize: 14,
						fontWeight: 'medium'
					}}
				>
					<AppIcon name='send' size='small' /> Verstuur
				</Box>
			</Box>
		</Box>
	);
}

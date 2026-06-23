import { AppIcon, type AppIconName } from '@/components/AppIcon.component';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import type { OpportunityStatus } from '@offertum/shared';

/**
 * Read-only 3-step status pipeline shown in the detail header — ported 1:1 from the design's
 * `StatusPipeline` (Werkruimte). Collapses the 6 wire statuses onto three milestones:
 * Nieuw → Beantwoord → Gewonnen/Verloren. Each step is a pill with an icon disc; the active
 * step tints accent (filled), done steps tint accent-50 with a check, the final step turns
 * the desaturated forest-green won palette (trophy) on a won deal or the terracotta lost
 * palette (cross) on a lost one. The editable status pill in the context rail drives the
 * actual (fully-open) status change — this is a glanceable progress mirror.
 */

interface PipelineStep {
	key: 'new' | 'replied' | 'won';
	label: string;
	icon: AppIconName;
}

const PIPELINE: readonly PipelineStep[] = [
	{ key: 'new', label: 'Nieuw', icon: 'inbox' },
	{ key: 'replied', label: 'Beantwoord', icon: 'send' },
	{ key: 'won', label: 'Gewonnen', icon: 'circle-check' }
];

// new → step 0; won/lost → step 2; everything in between (replied/waiting/cold) → step 1.
function pipelineIndexOf(status: OpportunityStatus): number {
	if (status === 'new') {
		return 0;
	}
	if (status === 'won' || status === 'lost') {
		return 2;
	}
	return 1;
}

export function StatusPipeline({ status }: { status: OpportunityStatus }) {
	const { tokens } = useTheme();
	const c = tokens.color;
	const idx = pipelineIndexOf(status);
	const isLost = status === 'lost';

	return (
		<Box sx={{ display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap', rowGap: 1 }}>
			{PIPELINE.map((stage, i) => {
				const done = i < idx;
				const active = i === idx;
				const lostFinal = isLost && i === 2;
				const wonActive = stage.key === 'won' && active && !isLost;

				const fg = lostFinal
					? c.lost[700]
					: wonActive
						? c.won[700]
						: active
							? c.accent.fg
							: done
								? c.accent[700]
								: c.ink4;
				const bg = lostFinal
					? c.lost[50]
					: wonActive
						? c.won[50]
						: active
							? c.accent[500]
							: done
								? c.accent[50]
								: c.paper2;
				const ring = lostFinal
					? c.lost[500]
					: wonActive
						? c.won[500]
						: active
							? c.accent[500]
							: done
								? c.accent[300]
								: c.lineStrong;
				const icon: AppIconName = lostFinal ? 'x' : wonActive ? 'trophy' : done ? 'check' : stage.icon;

				return (
					<Box key={stage.key} sx={{ display: 'inline-flex', alignItems: 'center' }}>
						{i > 0 && (
							<Box
								aria-hidden='true'
								sx={{ width: 28, height: 2, backgroundColor: i <= idx ? c.accent[300] : c.line }}
							/>
						)}
						<Box
							sx={{
								display: 'inline-flex',
								alignItems: 'center',
								gap: 1,
								padding: '6px 12px 6px 8px',
								backgroundColor: bg,
								border: `1px solid ${ring}`,
								borderRadius: `${tokens.radius.full}px`,
								color: fg,
								fontSize: 12.5,
								fontWeight: active ? 'bold' : 'medium',
								whiteSpace: 'nowrap'
							}}
						>
							<Box
								component='span'
								sx={{
									width: 20,
									height: 20,
									borderRadius: `${tokens.radius.full}px`,
									backgroundColor: active && !wonActive ? 'rgba(255, 255, 255, 0.2)' : 'transparent',
									display: 'inline-flex',
									alignItems: 'center',
									justifyContent: 'center'
								}}
							>
								<AppIcon name={icon} size='small' />
							</Box>
							{lostFinal ? 'Verloren' : stage.label}
						</Box>
					</Box>
				);
			})}
		</Box>
	);
}

import { AppIcon, type AppIconName } from '@/components/AppIcon.component';
import { Body, BodySmall } from '@/components/Text.component';
import type { AppTokens } from '@/lib/utils/theme.utils';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import { keyframes } from '@mui/material/styles';

/**
 * Toast tone — drives the left accent border + leading icon. Faithful port of the design's
 * `Toast` primitive (`src/ui.jsx`): info (indigo), success (green/won), error (red/lost).
 */
export type ToastTone = 'info' | 'success' | 'error';

export interface ToastProps {
	tone?: ToastTone;
	title: string;
	body?: string;
	onDismiss?: () => void;
}

const slideUp = keyframes`
	from { opacity: 0; transform: translateY(12px); }
	to { opacity: 1; transform: translateY(0); }
`;

const TONE_ICON: Record<ToastTone, AppIconName> = {
	info: 'info',
	success: 'circle-check',
	error: 'alert-circle'
};

/** Resolve the accent color (left border + leading icon) for a tone from the theme tokens. */
function toneAccent(tokens: AppTokens, tone: ToastTone): string {
	if (tone === 'success') {
		return tokens.color.won[500];
	}
	if (tone === 'error') {
		return tokens.color.lost[500];
	}
	return tokens.color.accent[500];
}

/**
 * Transient notification surface. `role="status"` + `aria-live="polite"` so screen readers
 * announce the message without stealing focus; a left accent border keyed by `tone` mirrors
 * the design. Stacking + auto-dismiss are owned by `ToastProvider` (`use-toast`); this
 * component is the presentational atom and is exported separately so it can be previewed and
 * reused in isolation.
 */
export function Toast({ tone = 'info', title, body, onDismiss }: ToastProps) {
	return (
		<Box
			role='status'
			aria-live='polite'
			sx={theme => ({
				display: 'flex',
				alignItems: 'flex-start',
				gap: 1.25,
				bgcolor: theme.tokens.color.surface,
				border: `1px solid ${theme.tokens.color.line}`,
				borderLeft: `4px solid ${toneAccent(theme.tokens, tone)}`,
				borderRadius: `${theme.tokens.radius.md}px`,
				p: '12px 16px',
				minWidth: 280,
				maxWidth: 360,
				boxShadow: theme.tokens.shadow[2],
				animation: `${slideUp} ${theme.tokens.motion.durBase}ms ${theme.tokens.motion.easeOut}`
			})}
		>
			<Box
				component='span'
				sx={theme => ({ display: 'inline-flex', mt: '1px', color: toneAccent(theme.tokens, tone) })}
			>
				<AppIcon name={TONE_ICON[tone]} size='medium' filled />
			</Box>

			<Box sx={{ flex: 1, minWidth: 0 }}>
				<Body fontWeight='medium' color='text.primary' sx={{ fontSize: 13, lineHeight: 1.4 }}>
					{title}
				</Body>
				{body && <BodySmall sx={{ fontSize: 12, mt: 0.25, lineHeight: 1.4 }}>{body}</BodySmall>}
			</Box>

			{onDismiss && (
				<IconButton
					aria-label='Melding sluiten'
					size='small'
					onClick={onDismiss}
					sx={theme => ({ color: theme.tokens.color.ink3, m: '-4px -4px -4px 0', p: 0.5 })}
				>
					<AppIcon name='x' size='small' />
				</IconButton>
			)}
		</Box>
	);
}

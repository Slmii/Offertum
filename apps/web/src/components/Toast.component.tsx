import { AppIcon, type AppIconName } from '@/components/AppIcon.component';
import { Body, BodySmall } from '@/components/Text.component';
import type { AppTokens } from '@/lib/utils/theme.utils';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';

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

const TONE_ICON: Record<ToastTone, AppIconName> = {
	info: 'info',
	success: 'circle-check',
	error: 'alert-circle'
};

// White text/icons on the filled tone background — the same contrast pairing the DS uses for
// filled 500 status surfaces (`statusColor(...).contrastText`).
const TOAST_FG = '#FFFFFF';

/** Resolve the filled background color for a tone from the theme tokens. */
function toneBg(tokens: AppTokens, tone: ToastTone): string {
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
 * announce the message without stealing focus; the whole card is filled with the tone color
 * (green success / red error / indigo info) and text/icons render in white for contrast.
 * Stacking, auto-dismiss, and enter/exit motion are owned by `ToastProvider`
 * (`use-toast`, backed by react-toastify); this component is the presentational atom and is
 * exported separately so it can be previewed and reused in isolation.
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
				bgcolor: toneBg(theme.tokens, tone),
				color: TOAST_FG,
				borderRadius: `${theme.tokens.radius.md}px`,
				py: 1.5,
				px: 2,
				minWidth: 280,
				maxWidth: 360,
				boxShadow: theme.tokens.shadow[2]
			})}
		>
			<Box component='span' sx={{ display: 'inline-flex', mt: 0.25, color: TOAST_FG }}>
				<AppIcon name={TONE_ICON[tone]} size='medium' filled />
			</Box>

			<Box sx={{ flex: 1, minWidth: 0 }}>
				<Body fontWeight='medium' color={TOAST_FG} sx={{ fontSize: 13, lineHeight: 1.4 }}>
					{title}
				</Body>
				{body && (
					<BodySmall color={TOAST_FG} sx={{ fontSize: 12, mt: 0.25, lineHeight: 1.4, opacity: 0.9 }}>
						{body}
					</BodySmall>
				)}
			</Box>

			{onDismiss && (
				<IconButton
					aria-label='Melding sluiten'
					size='small'
					onClick={onDismiss}
					sx={{ color: TOAST_FG, opacity: 0.8, m: '-4px -4px -4px 0', p: 0.5, '&:hover': { opacity: 1 } }}
				>
					<AppIcon name='x' size='small' />
				</IconButton>
			)}
		</Box>
	);
}

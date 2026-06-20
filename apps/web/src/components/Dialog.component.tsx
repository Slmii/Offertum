import { AppIcon } from '@/components/AppIcon.component';
import MuiDialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import { useId, type ReactNode } from 'react';

interface DialogProps {
	open: boolean;
	// Header text (e.g. "Abonneer in je agenda").
	title: ReactNode;
	children: ReactNode;
	onClose: () => void;
	// Footer buttons, right-aligned. Omit for a header + body only dialog.
	action?: ReactNode;
	// Max dialog width in px. Default 480 (DS default; 520 for content-heavy modals).
	width?: number;
	// Hide the header ✕ (e.g. a forced-choice dialog).
	hideClose?: boolean;
	// Block backdrop / Esc / ✕ close — use while a mutation is in flight.
	disableClose?: boolean;
}

/**
 * DRY modal dialog — ported from the design system's `Modal` (e.g. "Abonneer in je agenda").
 * Wraps MUI's `Dialog` so it gets the focus trap, portal, scroll-lock, Esc, and backdrop for
 * free; the DS look (radius-lg paper, hairline header/footer rules, 18px title, dimmed indigo
 * scrim) lives in the theme's `MuiDialog*` overrides, so this component stays styling-free.
 *
 * ```tsx
 * <Dialog
 *   open={open}
 *   title="Abonneer in je agenda"
 *   onClose={close}
 *   action={
 *     <>
 *       <Button onClick={close}>Annuleren</Button>
 *       <Button variant="contained" onClick={subscribe}>Abonnement aanmaken</Button>
 *     </>
 *   }
 * >
 *   …body…
 * </Dialog>
 * ```
 */
export function Dialog({
	open,
	title,
	children,
	onClose,
	action,
	width = 480,
	hideClose = false,
	disableClose = false
}: DialogProps) {
	// Tie the dialog to its title so screen readers announce a name (MUI doesn't auto-wire this).
	const titleId = useId();
	return (
		<MuiDialog
			open={open}
			onClose={disableClose ? undefined : onClose}
			fullWidth
			maxWidth={false}
			aria-labelledby={titleId}
			slotProps={{ paper: { sx: { width: '100%', maxWidth: width } } }}
		>
			<DialogTitle>
				{/* Wrap just the title text so the dialog's accessible name excludes the ✕ button's label. */}
				<span id={titleId}>{title}</span>
				{!hideClose && (
					<IconButton
						aria-label='Sluiten'
						onClick={onClose}
						disabled={disableClose}
						size='small'
						sx={{ color: 'inherit', mr: -0.5 }}
					>
						<AppIcon name='x' size='small' />
					</IconButton>
				)}
			</DialogTitle>
			<DialogContent>{children}</DialogContent>
			{action && <DialogActions>{action}</DialogActions>}
		</MuiDialog>
	);
}

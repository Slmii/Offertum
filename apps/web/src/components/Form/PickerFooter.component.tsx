import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { useTheme } from '@mui/material/styles';
import { usePickerContext } from '@mui/x-date-pickers/hooks';

/**
 * Calendar-popover footer — ported from the design's date/time picker. A "Vandaag" shortcut on
 * the left (jumps the selection to today) and the relative distance to the selected date on the
 * right ("over 6 dagen"). Wired in as the pickers' `actionBar` slot; reads the live value via
 * `usePickerContext`.
 */
export function PickerFooter({ className, confirmable }: { className?: string; confirmable?: boolean }) {
	const { tokens } = useTheme();
	const c = tokens.color;
	const { setValueToToday, acceptValueChanges } = usePickerContext();

	return (
		<Box
			// The layout passes a className that grid-positions the action bar (bottom, full width).
			// Spreading it is load-bearing — without it the footer floats out of place.
			className={className}
			sx={{
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'space-between',
				gap: 1.5,
				px: 2,
				py: 1.25,
				borderTop: `1px solid ${c.line}`
			}}
		>
			<Button variant='text' size='small' onClick={() => setValueToToday()} sx={{ fontWeight: 'bold' }}>
				Vandaag
			</Button>
			{confirmable ? (
				// Date+time has a multi-step flow (day → time), so an explicit confirm commits +
				// closes — selecting a time alone doesn't.
				<Button variant='contained' size='small' onClick={() => acceptValueChanges()}>
					Bevestigen
				</Button>
			) : null}
		</Box>
	);
}

/** `PickerFooter` preset with the confirm button — used as the date+time picker's action bar. */
export function PickerFooterWithConfirm(props: { className?: string }) {
	return <PickerFooter {...props} confirmable />;
}

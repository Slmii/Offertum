import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';

/**
 * Compact stat card — label on top in muted secondary, value on bottom in display
 * weight. First used by the admin AI-usage dashboard; same shape fits any "headline
 * number with caption" surface (billing summary, opportunities counts, etc.).
 *
 * Naming follows the project convention from CLAUDE.md: `PascalCase.component.tsx`.
 * Keep this component dumb — caller is responsible for formatting `value` to a string
 * via the `number.utils.ts` / `date.utils.ts` helpers.
 */
export interface SummaryCardProps {
	label: string;
	value: string;
}

export function SummaryCard({ label, value }: SummaryCardProps) {
	return (
		<Paper variant='outlined' sx={{ p: 2, flex: 1 }}>
			<Typography variant='caption' color='text.secondary' sx={{ display: 'block' }}>
				{label}
			</Typography>
			<Typography variant='h2' sx={{ fontSize: 22, mt: 0.5 }}>
				{value}
			</Typography>
		</Paper>
	);
}

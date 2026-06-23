import { AppIcon } from '@/components/AppIcon.component';
import { quoteDraftsQueryOptions } from '@/lib/queries/quote-drafts.queries';
import { toReadableEuro } from '@/lib/utils/number.utils';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import { computeQuoteTotals } from '@offertum/shared';
import { useSuspenseQuery } from '@tanstack/react-query';

/**
 * Right-rail quote summary card — ported from the design's `RailQuoteCard`. Surfaces that an
 * offerte already exists: an accent-tinted clickable card with the total, line count, an
 * "X zonder prijs" warning for unpriced lines, and an "Open →" affordance. Self-hides when the
 * opportunity has no quote draft yet. (The full quote builder is its own deferred page, so
 * "Open" is a no-op for now.)
 */
export function RailQuoteCard({ opportunityId, onOpen }: { opportunityId: string; onOpen?: () => void }) {
	const { tokens } = useTheme();
	const c = tokens.color;
	const { data } = useSuspenseQuery(quoteDraftsQueryOptions(opportunityId));

	// Drafts are newest-first; the latest is "the quote".
	const draft = data.drafts[0];
	if (!draft) {
		return null;
	}

	const totals = computeQuoteTotals(draft.lineItems);
	const total = toReadableEuro(totals.grossCents / 100);
	const lineCount = draft.lineItems.length;
	const unpricedCount = totals.unpricedLineCount;
	const statusLabel = draft.status === 'sent' ? 'Verzonden' : 'Concept';

	return (
		<Box
			component='button'
			type='button'
			onClick={onOpen}
			sx={{
				display: 'flex',
				flexDirection: 'column',
				gap: 1.25,
				width: '100%',
				textAlign: 'left',
				p: 2,
				backgroundColor: c.accent[50],
				border: `1px solid ${c.accent[300]}`,
				borderRadius: `${tokens.radius.md}px`,
				cursor: 'pointer',
				fontFamily: tokens.font.sans,
				'&:hover': { backgroundColor: c.accent[100] }
			}}
		>
			<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
				<Box component='span' sx={{ display: 'inline-flex', color: c.accent[700] }}>
					<AppIcon name='file-text' size='medium' />
				</Box>
				<Box
					component='span'
					sx={{ fontFamily: tokens.font.display, fontSize: 15, fontWeight: 600, color: c.ink1 }}
				>
					Offerte
				</Box>
				<Box
					component='span'
					sx={{
						ml: 'auto',
						px: 1,
						py: 0.25,
						borderRadius: `${tokens.radius.sm}px`,
						backgroundColor: c.surface,
						border: `1px solid ${c.lineStrong}`,
						color: c.ink2,
						fontSize: 11,
						fontWeight: 'bold'
					}}
				>
					{statusLabel}
				</Box>
			</Box>

			<Box
				sx={{
					fontFamily: tokens.font.display,
					fontSize: 22,
					fontWeight: 600,
					color: c.ink1,
					fontVariantNumeric: 'tabular-nums'
				}}
			>
				{total}
			</Box>

			<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%', fontSize: 12.5, color: c.ink3 }}>
				<Box component='span'>
					{lineCount} {lineCount === 1 ? 'regel' : 'regels'}
				</Box>
				{unpricedCount > 0 && (
					<>
						<Box component='span' sx={{ color: c.lineStrong }}>
							·
						</Box>
						<Box
							component='span'
							sx={{
								color: c.pending[700],
								fontWeight: 'bold',
								display: 'inline-flex',
								alignItems: 'center',
								gap: 0.5
							}}
						>
							<AppIcon name='alert-triangle' size='small' /> {unpricedCount} zonder prijs
						</Box>
					</>
				)}
				<Box
					component='span'
					sx={{
						ml: 'auto',
						display: 'inline-flex',
						alignItems: 'center',
						gap: 0.5,
						color: c.accent[700],
						fontWeight: 'bold'
					}}
				>
					Open <AppIcon name='arrow-right' size='small' />
				</Box>
			</Box>
		</Box>
	);
}

import { patternsQueryOptions, useDismissPattern } from '@/lib/queries/patterns.queries';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Stack from '@mui/material/Stack';
import { useSuspenseQuery } from '@tanstack/react-query';

/**
 * Renders 0–2 dismissible info banners surfacing AI-detected performance patterns
 * (e.g. reply-speed insights, win-rate correlations). The server already applies the
 * ≥10-opportunity gate and 30-day dismissal window — this component just renders
 * whatever the query returns. Renders nothing when the array is empty.
 *
 * Placed near the top of the dashboard (home route). Uses the loader-prefetched
 * `patternsQueryOptions` so there is no render-then-fetch waterfall.
 */
export function PatternBanners() {
	const { data: patterns } = useSuspenseQuery(patternsQueryOptions);
	const dismiss = useDismissPattern();

	if (patterns.length === 0) {
		return null;
	}

	return (
		<Stack useFlexGap spacing={1} sx={{ mb: 3 }}>
			{dismiss.isError && <Alert severity='error'>Verbergen is niet gelukt. Probeer het opnieuw.</Alert>}
			{patterns.map(pattern => (
				<Alert
					key={pattern.patternKey}
					severity='info'
					onClose={dismiss.isPending ? undefined : () => dismiss.mutate({ key: pattern.patternKey })}
					slotProps={{ closeButton: { disabled: dismiss.isPending } }}
				>
					<AlertTitle sx={{ fontWeight: 600 }}>{pattern.headline}</AlertTitle>
					{pattern.detail}
				</Alert>
			))}
		</Stack>
	);
}
